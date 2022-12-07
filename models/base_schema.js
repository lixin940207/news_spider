const NewsTypes = require("../models/news_type_enum");

const util = require('util');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;//规定表里面的字段的规范


const textSchema = new Schema({
    zh: String,
    en: String,
    fr: String,
})

const blockSchema = new Schema({
    type: String,
    src: String,
    en: Object,
    zh: Object,
    fr: Object
})

const articleSchema = new Schema({
    title: textSchema,
    summary: textSchema,
    articleHref: String,
    headImageHref: String,
    publishTime: String,
    bodyBlockList: [blockSchema],
})

const liveSchema = new Schema({
    liveTitle: textSchema,
    liveTime: String,
    liveHref: String,
    liveContent: articleSchema,
})

function BaseSchema() {
    Schema.apply(this, arguments);

    this.add({
        articleHref: {type: String, required: true, unique: true, index: true},
        imageHref: {type: String},
        title: textSchema,
        region: {type: String},
        categories: [String],
        publishTime: {type: String, index: true},
        ranking: {type: Number},
        displayOrder: {type: Number, index: true},
        summary: textSchema,
        newsType: {type: String, enum: Object.values(NewsTypes)},
        isLive: {type: Boolean, default: false},
        liveNewsList: [liveSchema],
        article: articleSchema,
        isVideo: Boolean,
        relatedNewsList: [{
            title: textSchema,
            article: articleSchema
        }],
    });
}

util.inherits(BaseSchema, Schema);

module.exports = BaseSchema;
