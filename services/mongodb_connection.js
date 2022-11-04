const mongoose = require("mongoose")
const logger = require('../config/logger');

const fs = require('fs');
const path = require("path");

mongoose.Promise = Promise;

const data = fs.readFileSync(path.join(__dirname, '../config.json'), { encoding: 'utf-8' });
const config = JSON.parse(data);

const { replicaSetHosts, database, writeConcern, readPreference } = config.mongodb;
const uri = `mongodb://${replicaSetHosts}/${database}?w=${writeConcern}&readPreference=${readPreference}`;


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
