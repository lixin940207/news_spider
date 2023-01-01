const md5 = require('md5');
const {getResultFromRedis, redis} = require("../redis_connection");
const {
    ENABLE_TRANSLATE,
    ENABLE_SUMMARIZE,
    AWS_REGION,
    SUMMARIZE_MAX_LENGTH,
    SUMMARIZE_REDUCE_LENGTH
} = require("../../config/config");
const {pushToQueueAndWaitForTranslateRes} = require("./translations");
const logger = require("../../config/logger");
const aws = require("aws-sdk");

const sagemakerRuntime = new aws.SageMakerRuntime({
    apiVersion: '2017-05-13',
    region: AWS_REGION,
});

async function asyncSummarize(article, ori) {
    if (!ENABLE_SUMMARIZE) {
        return undefined;
    }
    if (ENABLE_TRANSLATE) {
        const summarize_results = await Promise.all([
            pushArticleToNLPSummarizeQueue(article, "en"),
            pushArticleToNLPSummarizeQueue(article, "fr"),
        ]);

        if (summarize_results instanceof Error) {
            return {};
        }
        return {
            en: summarize_results[0],
            fr: summarize_results[1],
            zh: await pushToQueueAndWaitForTranslateRes(summarize_results[0], 'en_zh'),
        };
    } else {
        if (ori === 'zh') {
            return {'zh': 'not supported yet.'};
        }
        return {
            [ori]: await pushArticleToNLPSummarizeQueue(article, ori),
        }
    }
}

async function invokeSageMaker(toBeSummarized, lang) {
    try {
        return await sagemakerRuntime.invokeEndpoint({
            EndpointName: process.env['SUMMARIZATION_' + lang.toUpperCase() + '_ENDPOINT']
                || 'summarization-' + lang + '-endpoint',
            Body: JSON.stringify({
                inputs: toBeSummarized.slice(0, Math.min(toBeSummarized.length, SUMMARIZE_MAX_LENGTH)),
            }),
            ContentType: "application/json",
        }).promise();
    } catch (e) {
        return e;
    }
}

async function pushArticleToNLPSummarizeQueue(article, lang) {
    let toBeSummarized = '';
    if (article.summary[lang]) {
        toBeSummarized += article.summary[lang];
    }

    for (const block of article.bodyBlockList) {
        if (['h2', 'p', 'blockquote',].includes(block.type)) {
            toBeSummarized += block[lang];
        }
    }
    if (toBeSummarized === '') {
        return "";
    } else {
        const key = "summarize" + '_' + lang + '_' + md5(toBeSummarized);
        const existingRes = await getResultFromRedis(key);
        if (existingRes) {
            return existingRes;
        }
        let response;
        response = await invokeSageMaker(toBeSummarized, lang);
        if (response instanceof Error){
            logger.error('sagemaker summarize error, try again',
                {lang, error: response});
            while (toBeSummarized.length > 0
            && response instanceof Error
            && response.message.includes('index out of range in self')) {
                    logger.error('sagemaker summarize out of range error, reduce the length, try again',
                        {lang, error: response});
                    toBeSummarized = toBeSummarized.slice(0, Math.max(1, toBeSummarized.length - SUMMARIZE_REDUCE_LENGTH))
                    response = await invokeSageMaker(toBeSummarized, lang);
            }
            if (response instanceof Error) {
                response = await invokeSageMaker(toBeSummarized, lang);
                if (response instanceof Error) {
                    logger.error('sagemaker summarize still error, return null',
                        {lang, error: response});
                    return "";
                }
            }
            logger.debug('sagemaker summarize out of range error solved',
                {lang, response});
        }

        const res = JSON.parse(response.Body.toString())[0]['summary_text'];
        await redis.set(key, JSON.stringify(res));
        await redis.expire(key, 9000);
        return res;
    }
}

module.exports = {
    pushArticleToNLPSummarizeQueue,
    asyncSummarize,
}
