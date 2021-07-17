const BaseSchema = require('./base_schema');
const articleSchema = require('./article_schema')
const mongoose = require('mongoose');


const NYTimesSchema = new BaseSchema({
}, {timestamps: true});

const NYTimesModel = mongoose.model('nytimes_news', NYTimesSchema);

async function getNewsById(id) {
    return await NYTimesModel.findById(id);
}

async function getNewsByHref(href) {
    return await NYTimesModel.findOne({articleHref: href});
}

async function createNews(news) {
    return await NYTimesModel.create(news);
}

async function upsertNews(news) {
    if (await NYTimesModel.findOne({articleHref: news.articleHref})){
        return await NYTimesModel.updateOne(
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
        return await NYTimesModel.create(news);
    }
}


async function bulkUpsertNews(newsArr) {
    return await NYTimesModel.bulkWrite(newsArr.map(item=>{
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
    getNewsById,
    getNewsByHref,
    createNews,
    upsertNews,
    bulkUpsertNews,
}

