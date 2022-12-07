const md5 = require('md5');
const {delAsync} = require("../redis_connection");
const {rPushAsync} = require("../redis_connection");
const {getAsync} = require("../redis_connection");
const {REDIS_NLP_TRANSLATE_QUEUE_KEY} = require("../../config/config");

async function asyncTranslate(text, ori) {
    const i = {}
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
    return i;
}

async function pushToQueueAndWaitForTranslateRes(q, lang) {
    if (!q) {
        return "";
    } else {
        const key = lang + md5(q);
        await rPushAsync(REDIS_NLP_TRANSLATE_QUEUE_KEY + lang, JSON.stringify({
            q,
            key: key,
            task: "translation",
            lang,
        }));
        return await recursiveGetValidResult(key);
    }
}

async function recursiveGetValidResult(sign) {
    const reply = await getAsync(sign);
    if (reply !== null) {
        await delAsync(sign);
        return JSON.parse(reply);
    } else {
        return await recursiveGetValidResult(sign);
    }
}

module.exports = {
    pushToQueueAndWaitForTranslateRes,
    asyncTranslate,
}
