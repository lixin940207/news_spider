const mongoose = require('mongoose');
const Schema = mongoose.Schema;//规定表里面的字段的规范

const articleSchema = new Schema({
    title: {
        zh: String,
        en: String,
        fr: String
    },
    summary: {
        zh: String,
        en: String,
        fr: String
    },
    articleHref: String,
    headImageHref: String,
    publishTime: String,
    bodyBlockList: [{type: String, src: String, fr: Object, zh: Object, en: Object}],
    abstract: {
        zh: String,
        en: String,
        fr: String
    },
})

module.exports = articleSchema
