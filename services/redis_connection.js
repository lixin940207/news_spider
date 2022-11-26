const redis = require("redis");
// const {translateText} = require("./utils/translations");
// const {REDIS_INPUT_QUEUE_KEY} = require("../config/config");

const redis_host = process.env.REDIS_HOST || '127.0.0.1';
const redis_port = process.env.REDIS_PORT || 6379;

const redisClient = redis.createClient({
    host: redis_host,
    port: redis_port
});

redisClient.on("ready", function() {
    console.log("redis ready");
});

redisClient.on("error", function(error) {
    console.error(error);
});

const { promisify } = require("util");
const getAsync = promisify(redisClient.get).bind(redisClient);
const rPushAsync = promisify(redisClient.rpush).bind(redisClient);
const lPopAsync = promisify(redisClient.lpop).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);
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
    delAsync
};
