// const redisClient = require('../redis_connection');
const axios = require('axios');
const {Translate} = require('@google-cloud/translate').v2;
const md5 = require('md5');
const assert = require("assert");
const {rPushAsync} = require("../redis_connection");
const {getAsync} = require("../redis_connection");
const {REDIS_INPUT_QUEUE_KEY} = require("../../config/config");


const {
    GOOGLE_TRANSLATION_API,
    GOOGLE_API_KEY,
    BAIDU_TRANSLATION_API,
    BAIDU_APP_ID,
    BAIDU_SECRET_KEY
} = require("../../config/config");

const translate = new Translate({
    projectId: "stellar-acre-320617",
    keyFilename: "./config/stellar-acre-320617-59ecbb8ce446.json"
});


async function pushToQueueAndWaitForTranslateRes(q) {
    if (q === undefined || q === null){
        return "";
    }
    const salt = (new Date).getTime();
    const str = BAIDU_APP_ID + q + salt + BAIDU_SECRET_KEY;
    const sign = md5(str);
    await rPushAsync(REDIS_INPUT_QUEUE_KEY, JSON.stringify({q, sign, salt}));
    return await recursiveGetValidResult(sign);
}

async function recursiveGetValidResult(sign) {
    const reply = await getAsync(sign);
    if (reply !== null){
        return reply;
    }else{
        return await recursiveGetValidResult(sign);
    }
}

// async function translateText(q, salt, sign, from = 'auto', to = 'zh') {
//     // try{
//     //     let [translations] = await translate.translate(q, target);
//     //     return translations;
//     // }catch (e) {
//     //     return undefined;
//     // }
//     const response = await axios.get(BAIDU_TRANSLATION_API, {
//         params: {
//             q,
//             from,
//             to,
//             appid: BAIDU_APP_ID,
//             salt,
//             sign,
//         },
//         headers: {'Content-Type': 'application/json'}
//     });
//     return response.data.trans_result[0].dst;
// }

module.exports = {
    // translateText,
    pushToQueueAndWaitForTranslateRes,
}
