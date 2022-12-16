const Redis = require("ioredis");

const redis_host = process.env.REDIS_HOST || '127.0.0.1';
const redis_port = process.env.REDIS_PORT || 6379;

let redis;
if (process.env.ENV === 'PRODUCTION') {
    redis = new Redis.Cluster([
            {
                host: redis_host,
                port: redis_port,
            }
        ],
        {
            dnsLookup: (address, callback) => callback(null, address),
            redisOptions: {
                tls: true,
            },
        })
} else {
    redis = new Redis(redis_port, redis_host);
}




redis.on('connect', () => {
    console.log('Redis Connection Initialized.');
});

redis.on('disconnect', () => {
    console.log('Redis Connection Destroyed.');
});

redis.on('error', ({message, ...rest}) => {
    console.log({
        message: `Redis Connection Failed: ${message}`,
        ...rest,
    });
});

// const {promisify} = require("util");
// const getAsync = promisify(redisClient.get).bind(redisClient);
// const rPushAsync = promisify(redisClient.rpush).bind(redisClient);
// const lPopAsync = promisify(redisClient.lpop).bind(redisClient);
// const delAsync = promisify(redisClient.del).bind(redisClient);
// const setExpireAsync = promisify(redisClient.expire).bind(redisClient)

async function getResultFromRedis(sign, recursive, start) {
    const reply = await redis.get(sign);
    if (reply !== null && reply !== undefined) {
        // await delAsync(sign);
        await redis.expire(sign, 9000);
        return JSON.parse(reply);
    } else {
        if (!recursive || (new Date() - start) > 600000) {
            return null;
        } else {
            return await getResultFromRedis(sign, true, start);
        }
    }
}


module.exports = {
    redis,
    getResultFromRedis,
};
