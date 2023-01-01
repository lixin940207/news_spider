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

async function getResultFromRedis(sign) {
    const reply = await redis.get(sign);
    if (reply !== null && reply !== undefined) {
        await redis.expire(sign, 9000);
        return JSON.parse(reply);
    }
    return null;
}


module.exports = {
    redis,
    getResultFromRedis,
};
