const winston = require('winston');
require('winston-daily-rotate-file');

const {transports, format} = winston;
const {File, Console} = transports;

const logger = winston.createLogger({
    format: format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        format.json(),
    ),
    transports: [
        new File({
            name: 'base_logger',
            filename: `../log/info.log`,
            prepend: false,
            datePattern: 'yyyy-MM-dd',
            level: 'info',
            label: module.filename,
        }),
        new File({
            name: 'error_logger',
            filename: `../log/error.log`,
            prepend: false,
            datePattern: 'yyyy-MM-dd',
            level: 'error',
            label: module.filename,
        }),
    ],
});

logger.add(new Console({
    // format: winston.format.splat(),
    name: 'base_logger',
    prepend: false,
    datePattern: 'yyyy-MM-dd',
    level: 'debug',
    label: module.filename,

}));


module.exports = logger;
