const BaseSchema = require('./base_schema');
const mongoose = require('mongoose');


const NewsModel = mongoose.model('news', new BaseSchema(
    {
        platform: {type: String, required: true}
    }, {
        timestamps: true
    }));

async function list() {
    return await NewsModel.find({});
}

async function getNewsById(id) {
    return await NewsModel.findById(id);
}

async function getNewsByHref(href) {
    return await NewsModel.findOne({articleHref: href});
}

async function createNews(news) {
    return await NewsModel.create(news);
}

async function upsertNews(news) {
    if (await NewsModel.findOne({articleHref: news.articleHref})) {
        return await NewsModel.updateOne(
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
        return await NewsModel.create(news);
    }
}

async function bulkUpsertNews(newsArr) {
    return await NewsModel.bulkWrite(newsArr.map(item=>{
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
    bulkUpsertNews
}
