const md5 = require("md5");
const {getResultFromRedis, redis} = require("../redis_connection");
const {AWS_REGION} = require("../../config/config");
const logger = require("../../config/logger");
const aws = require("aws-sdk");

const sagemakerRuntime = new aws.SageMakerRuntime({
    apiVersion: '2017-05-13',
    region: AWS_REGION,
});

async function asyncKeywordExtractor(title) {
    if (title.en) {
        return await pushToQueueAndWaitForKeywordExtractRes(title.en, 'en');
    } else {
        return [];
    }
}

async function pushToQueueAndWaitForKeywordExtractRes(q, lang) {
    if (!q) {
        return "";
    } else {
        const key = "keyword_extract" + '_' + lang + '_' + md5(q);
        const existingRes = await getResultFromRedis(key);
        if (existingRes) {
            return existingRes;
        }
        const response = await sagemakerRuntime.invokeEndpoint({
            EndpointName: process.env['KEYWORD_EXTRACTOR_ENDPOINT']
                || 'keyword-extractor-endpoint',
            Body: JSON.stringify({
                inputs: q,
            }),
            ContentType: "application/json",
        }).promise();
        if (response instanceof Error) {
            logger.error('sagemaker translate error', q, lang);
            return "";
        }
        const res = JSON.parse(response.Body.toString());

        let words = []
        let start = 0
        let end = 0
        for (let i = 0; i < res.length; i++) {
            if (res[i]['entity'] === 'B-KEY') {
                if (start !== end) {
                    words.push(q.slice(start, end));
                }
                start = res[i]['start'];
                end = res[i]['end'];
            } else {
                end = res[i]['end'];
            }
        }
        if (start !== end) {
            words.push(q.slice(start, end));
        }

        await redis.set(key, JSON.stringify(words));
        await redis.expire(key, 9000);
        return words;
    }
}

module.exports = {
    asyncKeywordExtractor,
}
