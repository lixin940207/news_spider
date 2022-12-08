const redis = require("redis");
// const {translateText} = require("./utils/translations");
// const {REDIS_INPUT_QUEUE_KEY} = require("../config/config");

const redis_host = process.env.REDIS_HOST || '127.0.0.1';
const redis_port = process.env.REDIS_PORT || 6379;

const redisClient = redis.createClient({
    host: redis_host,
    port: redis_port
});

redisClient.on("ready", function () {
    console.log("redis ready");
});

redisClient.on("error", function (error) {
    console.error(error);
});

const {promisify} = require("util");
const getAsync = promisify(redisClient.get).bind(redisClient);
const rPushAsync = promisify(redisClient.rpush).bind(redisClient);
const lPopAsync = promisify(redisClient.lpop).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);
const setExpireAsync = promisify(redisClient.expire).bind(redisClient)

async function getResultFromRedis(sign, recursive=true) {
    const reply = await getAsync(sign);
    if (reply !== null && reply !== undefined) {
        // await delAsync(sign);
        await setExpireAsync(sign, 5400);
        return JSON.parse(reply);
    } else {
        if (recursive) {
            return await getResultFromRedis(sign);
        } else {
            return null;
        }
    }
}


module.exports = {
    redisClient,
    getAsync,
    rPushAsync,
    lPopAsync,
    delAsync,
    setExpireAsync,
    getResultFromRedis,
};
