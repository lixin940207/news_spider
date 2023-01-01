const md5 = require('md5');
const aws = require('aws-sdk');
const logger = require('../../config/logger');
const {getResultFromRedis, redis} = require("../redis_connection");
const {ENABLE_TRANSLATE, AWS_REGION, TRANSLATE_MAX_CONCURRENCY} = require("../../config/config");

const sagemakerRuntime = new aws.SageMakerRuntime({
    apiVersion: '2017-05-13',
    region: AWS_REGION,
});

async function asyncTranslate(text, ori) {
    let i = {};
    if (ENABLE_TRANSLATE) {
        if (ori === "en") {
            i.en = text;
            i.fr = await pushToQueueAndWaitForTranslateRes(i.en, "en_fr");
            i.zh = await pushToQueueAndWaitForTranslateRes(i.en, "en_zh");
        } else if (ori === "fr") {
            i.fr = text;
            i.en = await pushToQueueAndWaitForTranslateRes(i.fr, "fr_en");
            i.zh = await pushToQueueAndWaitForTranslateRes(i.en, "en_zh");
        } else {
            i.zh = text;
            i.en = await pushToQueueAndWaitForTranslateRes(i.zh, "zh_en");
            i.fr = await pushToQueueAndWaitForTranslateRes(i.en, "en_fr");
        }
    } else {
        i[ori] = text;
    }
    return i;
}

async function invokeSageMaker(q, i, lang) {
    try {
        return await sagemakerRuntime.invokeEndpoint({
            EndpointName: process.env['TRANSLATION_'+lang.toUpperCase()+'_ENDPOINT']
                || 'translation-' + lang.replace('_', '-') + '-endpoint',
            Body: JSON.stringify({
                inputs: q.slice(i ,Math.min(q.length, i+TRANSLATE_MAX_CONCURRENCY))
            }),
            ContentType: "application/json",
        }).promise();
    } catch (e) {
        return e;
    }
}

async function pushToQueueAndWaitForTranslateRes(q, lang) {
    if (!q) {
        return "";
    } else {
        const isStr = typeof q === "string";
        const key = "translation" + '_' + lang + '_' + md5(isStr? q: q.join());
        const existingRes = await getResultFromRedis(key);
        if (existingRes) {
            return existingRes;
        }
        logger.debug('translating', {q, lang});
        let parsedList = [];

        if (isStr) {
            q = [q];
        }
        for (let i = 0; i < q.length; i += TRANSLATE_MAX_CONCURRENCY) {
            let response = await invokeSageMaker(q, i, lang);
            if (response instanceof Error) {
                logger.error('sagemaker translate error, try again', q, lang);
                response = await invokeSageMaker(q, i, lang);
                if (response instanceof Error) {
                    logger.error('sagemaker translate error again, return null', q, lang);
                    return "";
                }
            }
            parsedList.push(...JSON.parse(response.Body.toString())
                .map( i => i['translation_text']));
        }

        let res = parsedList;
        if (isStr) {
            res = parsedList[0];
        }
        await redis.set(key, JSON.stringify(res));
        await redis.expire(key, 9000);
        return res;
    }
}

module.exports = {
    pushToQueueAndWaitForTranslateRes,
    asyncTranslate,
}
