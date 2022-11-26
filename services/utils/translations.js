// const redisClient = require('../redis_connection');
const md5 = require('md5');
const {delAsync} = require("../redis_connection");
const {rPushAsync} = require("../redis_connection");
const {getAsync} = require("../redis_connection");
const {REDIS_INPUT_QUEUE_KEY} = require("../../config/config");


const {
    BAIDU_APP_ID,
    BAIDU_SECRET_KEY
} = require("../../config/config");


async function pushToQueueAndWaitForTranslateRes(q) {
    if (!q ){
        return "";
    } else if (q.split('\n').length > 1) {
        return (
            await Promise.all(
                (q.split('\n').map( async s => {
                    const salt = (new Date).getTime();
                    const str = BAIDU_APP_ID + s + salt + BAIDU_SECRET_KEY;
                    const sign = md5(str);
                    await rPushAsync(REDIS_INPUT_QUEUE_KEY, JSON.stringify({q: s, sign, salt}));
                    return await recursiveGetValidResult(sign);
                })
            ))
        ).join('\n');
    }  else {
        const salt = (new Date).getTime();
        const str = BAIDU_APP_ID + q + salt + BAIDU_SECRET_KEY;
        const sign = md5(str);
        await rPushAsync(REDIS_INPUT_QUEUE_KEY, JSON.stringify({q, sign, salt}));
        return await recursiveGetValidResult(sign);
    }
}

async function recursiveGetValidResult(sign) {
    const reply = await getAsync(sign);
    if (reply !== null){
        await delAsync(sign);
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
