const mongoose = require('mongoose');
const Schema = mongoose.Schema;//规定表里面的字段的规范

const articleSchema = new Schema({
    title: {cn:String, ori:String},
    summary: {cn:String, ori:String},
    articleHref: String,
    headImageHref: String,
    publishTime: Date,
    bodyBlockList: [{type: String, src: String, ori:Object, cn:Object}],
})

module.exports = articleSchema
