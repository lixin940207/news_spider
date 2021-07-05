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
        // createdAt: {type: Number, default: Date.now.valueOf(),  },
        // updatedAt: {type: Number, default: Date.now.valueOf(), },
        originCreatedAt: {type: String},
        ranking: {type: Number},
        summary: {type: String},
        newsType: {type: String, enum: Object.values(NewsTypes)},
        isLive: {type: Boolean, default: false},
        liveNewsList: {
            type: [liveSchema]
        },
        content: {type: String},
    });
}
util.inherits(BaseSchema, Schema);

module.exports = BaseSchema;
