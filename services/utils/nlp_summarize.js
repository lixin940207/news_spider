const md5 = require('md5');
const {delAsync} = require("../redis_connection");
const {rPushAsync} = require("../redis_connection");
const {getAsync} = require("../redis_connection");
const {REDIS_NLP_SUMMARIZE_QUEUE_KEY} = require("../../config/config");

async function pushArticleToNLPSummarizeQueue(article, lang) {
    const toBeSummarizedList  = []
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
    if (toBeSummarizedList.length === 0){
        return "";
    } else {
        const key = lang + md5(article.articleHref);
        await rPushAsync(REDIS_NLP_SUMMARIZE_QUEUE_KEY, JSON.stringify({
                q: toBeSummarizedList,
                key,
                task: "summarize",
                lang,
            })
        );
        return await recursiveGetValidResult(key);
    }
}

async function recursiveGetValidResult(key) {
    const reply = await getAsync(key);
    if (reply !== null){
        await delAsync(key);
        return reply;
    }else{
        return await recursiveGetValidResult(key);
    }
}

module.exports = {
    pushArticleToNLPSummarizeQueue,
}
