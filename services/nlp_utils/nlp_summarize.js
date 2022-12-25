const md5 = require('md5');
const {getResultFromRedis, redis} = require("../redis_connection");
const {REDIS_NLP_SUMMARIZE_QUEUE_KEY, ENABLE_TRANSLATE, ENABLE_SUMMARIZE} = require("../../config/config");
const {pushToQueueAndWaitForTranslateRes} = require("./translations");

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

async function pushArticleToNLPSummarizeQueue(article, lang) {
    let toBeSummarized = '';
    if (article.summary[lang]) {
        toBeSummarized += article.summary[lang];
    }

    for (const block of article.bodyBlockList) {
        if (block.type in ['h2', 'p', 'blockquote',]) {
            toBeSummarized += block[lang];
        }
    }
    if (toBeSummarized === '') {
        return "";
    } else {
        const key = "summarize" + '_' + lang + '_' + md5(toBeSummarized);
        const existingRes = await getResultFromRedis(key, false);
        if (existingRes) {
            return existingRes;
        }
        await redis.rpush(REDIS_NLP_SUMMARIZE_QUEUE_KEY, JSON.stringify({
                q: toBeSummarized,
                key,
                task: "summarize",
                lang,
            })
        );
        return await getResultFromRedis(key, true, new Date());
    }
}

module.exports = {
    pushArticleToNLPSummarizeQueue,
    asyncSummarize,
}
