const md5 = require('md5');
const {getResultFromRedis} = require("../redis_connection");
const {rPushAsync} = require("../redis_connection");
const {REDIS_NLP_SUMMARIZE_QUEUE_KEY, ENABLE_TRANSLATE, ENABLE_SUMMARIZE} = require("../../config/config");
const {pushToQueueAndWaitForTranslateRes} = require("./translations");

async function asyncSummarize(article, ori) {
    if (!ENABLE_SUMMARIZE) {
        return undefined;
    }
    if (ENABLE_TRANSLATE) {
        const summarize_resulsts = await Promise.all([
            pushArticleToNLPSummarizeQueue(article, "en"),
            pushArticleToNLPSummarizeQueue(article, "fr"),
            pushToQueueAndWaitForTranslateRes(article.abstract.en, 'en_zh')
        ]);
        if (summarize_resulsts instanceof Error) {
            return {};
        }
        return {
            en: summarize_resulsts[0],
            fr: summarize_resulsts[1],
            zh: summarize_resulsts[2],
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
    const toBeSummarizedList = []
    if (article.summary[lang]) {
        toBeSummarizedList.push(article.summary[lang]);
    }
    let tempStr = "";

    for (const block of article.bodyBlockList) {
        if (block.type === 'h2') {
            if (tempStr !== "") {
                toBeSummarizedList.push(tempStr);
            }
            tempStr = block[lang];
        } else if (block[lang] !== undefined) {
            if (block[lang] instanceof Array) {
                tempStr += ' ' + block[lang].join(' ');
            } else {
                tempStr += ' ' + block[lang];
            }
        }
    }
    if (tempStr !== "") {
        toBeSummarizedList.push(tempStr);
    }
    if (toBeSummarizedList.length === 0) {
        return "";
    } else {
        const key = lang + md5(toBeSummarizedList.join());
        const existingRes = await getResultFromRedis(key, false);
        if (existingRes) {
            return existingRes;
        }
        await rPushAsync(REDIS_NLP_SUMMARIZE_QUEUE_KEY, JSON.stringify({
                q: toBeSummarizedList,
                key,
                task: "summarize",
                lang,
            })
        );
        return await getResultFromRedis(key);
    }
}

module.exports = {
    pushArticleToNLPSummarizeQueue,
    asyncSummarize,
}
