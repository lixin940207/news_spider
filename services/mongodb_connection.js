const mongoose = require("mongoose")
const logger = require('../config/logger');

const uri = 'mongodb://localhost:27017/news_spider';

mongoose.Promise = Promise;


mongoose.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true)
const db = mongoose.connection;


db.on('open', ()=>{
    logger.info('db connected!');
});

db.on('error', (e) => {
    logger.error(e);
});




module.exports = db;
