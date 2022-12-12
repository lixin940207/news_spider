const md5 = require("md5");
const {getResultFromRedis, rPushAsync} = require("../redis_connection");
const {REDIS_NLP_KEYWORD_EXTRACT_QUEUE_KEY} = require("../../config/config");

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
        const existingRes = await getResultFromRedis(key, false);
        if (existingRes) {
            return existingRes;
        }
        await rPushAsync(REDIS_NLP_KEYWORD_EXTRACT_QUEUE_KEY, JSON.stringify({
            q,
            key: key,
            task: "keyword_extract",
            lang,
        }));
        return await getResultFromRedis(key, true, new Date());
    }
}

module.exports = {
    asyncKeywordExtractor,
}
