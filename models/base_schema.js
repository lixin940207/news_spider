const NewsTypes = require("../models/news_type_enum");

const util = require('util');
const mongoose = require('mongoose');
const articleSchema = require("./article_schema");
const Schema = mongoose.Schema;//规定表里面的字段的规范

const liveSchema = new Schema({
    liveTitle: String,
    liveTime: String,
    liveHref: String,
    liveContent: articleSchema,
})

function BaseSchema() {
    Schema.apply(this, arguments);

    this.add({
        articleHref: {type: String, required:true, unique: true, index: true},
        imageHref: {type: String},
        title: {type: String, required: true},
        region: {type: String},
        category: {type: String},
        publishTime: {type: String},
        ranking: {type: Number},
        summary: {type: String},
        summary_list: [{title: String}],
        newsType: {type: String, enum: Object.values(NewsTypes)},
        isLive: {type: Boolean, default: false},
        liveNewsList: [liveSchema],
        content: {type: String},
        article: articleSchema,
        isVideo: Boolean,
        relatedNewsList: [{title: String, article: articleSchema}],
    });
}
util.inherits(BaseSchema, Schema);

module.exports = BaseSchema;
