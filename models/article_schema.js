const mongoose = require('mongoose');
const Schema = mongoose.Schema;//规定表里面的字段的规范

const articleSchema = new Schema({
    title: {type: String, required: true},
    summary: {type: String},
    articleHref: String,
    headImageHref: String,
    publishTime: {type: String},
    bodyBlockList: [String],
})

module.exports = articleSchema
