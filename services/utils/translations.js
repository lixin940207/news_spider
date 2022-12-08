const md5 = require('md5');
const {getResultFromRedis} = require("../redis_connection");
const {rPushAsync} = require("../redis_connection");
const {REDIS_NLP_TRANSLATE_QUEUE_KEY, ENABLE_TRANSLATE} = require("../../config/config");

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

async function pushToQueueAndWaitForTranslateRes(q, lang) {
    if (!q) {
        return "";
    } else {
        const key = lang + md5(q.join());
        const existingRes = await getResultFromRedis(key, false);
        if (existingRes) {
            return existingRes;
        }
        await rPushAsync(REDIS_NLP_TRANSLATE_QUEUE_KEY + lang, JSON.stringify({
            q,
            key: key,
            task: "translation",
            lang,
        }));
        return await getResultFromRedis(key);
    }
}

module.exports = {
    pushToQueueAndWaitForTranslateRes,
    asyncTranslate,
}
