const winston = require('winston');
require('winston-daily-rotate-file');

const { transports } = winston;
const { File, Console } = transports;

const logger = winston.createLogger({
    transports: [
        new File({
            name: 'base_logger',
            filename: `../log/info.log.`,
            prepend: false,
            datePattern: 'yyyy-MM-dd',
            level: 'info',
            label: module.filename,
        }),
        new File({
            name: 'error_logger',
            filename: `../log/error.log.`,
            prepend: false,
            datePattern: 'yyyy-MM-dd',
            level: 'error',
            label: module.filename,
        }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new Console({
        format: winston.format.splat(),
    }));
}

module.exports = logger;
