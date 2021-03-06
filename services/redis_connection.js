const redis = require("redis");
const {translateText} = require("./utils/translations");
const {REDIS_INPUT_QUEUE_KEY} = require("../config/config");
const redisClient = redis.createClient({
    host: '127.0.0.1',
    port: 6379
});

redisClient.on("ready", function(error) {
    console.log("redis ready");
});

redisClient.on("error", function(error) {
    console.error(error);
});

const { promisify } = require("util");
const getAsync = promisify(redisClient.get).bind(redisClient);
const rPushAsync = promisify(redisClient.rpush).bind(redisClient);
const lPopAsync = promisify(redisClient.lpop).bind(redisClient);
//
// setInterval(async ()=>{
//     const reply = await lPopAsync(REDIS_INPUT_QUEUE_KEY);
//     if(reply !==  null) {
//         const replyObj = JSON.parse(reply);
//         const translateRes = await translateText(replyObj.q, replyObj.salt, replyObj.sign);
//         redisClient.set(replyObj.sign, translateRes);
//     }
// }, 1000)



module.exports = {
    redisClient,
    getAsync,
    rPushAsync,
    lPopAsync,
};
