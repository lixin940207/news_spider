const BaseSchema = require('./base_schema');
const mongoose = require('mongoose');
const articleSchema = require("./article_schema");


const LeMondeSchema = new BaseSchema({
    category: String,
    relatedNewsList: [{
        relatedTitle: String,
        relatedHref: String}],
    article: articleSchema,
}, {timestamps: true});

const LeMondeModel = mongoose.model('lemonde_news', LeMondeSchema);

async function list() {
    return await LeMondeModel.find({});
}

async function getNewsById(id) {
    return await LeMondeModel.findById(id);
}

async function getNewsByHref(href) {
    return await LeMondeModel.findOne({articleHref: href});
}

async function createNews(news) {
    return await LeMondeModel.create(news);
}

async function upsertNews(news) {
    if (await LeMondeModel.findOne({articleHref: news.articleHref})){
        return await LeMondeModel.updateOne(
            {
                articleHref: news.articleHref
            },
            {
                $set: news
            },
            {
                upsert: true,
                new: true
            });
    } else {
        return await LeMondeModel.create(news);
    }
}

async function bulkUpsertNews(newsArr) {
    return await LeMondeModel.bulkWrite(newsArr.map(item=>{
        return {
            updateOne:{
                filter: {articleHref: item.articleHref},
                update: item,
                upsert: true,
            }
        }
    }));
}

module.exports = {
    list,
    getNewsById,
    getNewsByHref,
    createNews,
    upsertNews,
    bulkUpsertNews,
}

