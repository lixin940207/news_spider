const BaseSchema = require('./base_schema');
const mongoose = require('mongoose');

const BBCSchema = new BaseSchema({}, {
    timestamps: true
});

const BBCModel = mongoose.model('bbc_news', BBCSchema);


async function list() {
    return await BBCModel.find({});
}

async function getNewsById(id) {
    return await BBCModel.findById(id);
}

async function getNewsByHref(href) {
    return await BBCModel.findOne({articleHref: href});
}

async function createNews(news) {
    return await BBCModel.create(news);
}

async function upsertNews(news) {
    if (await BBCModel.findOne({articleHref: news.articleHref})) {
        return await BBCModel.updateOne(
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
        return await BBCModel.create(news);
    }
}

async function bulkUpsertNews(newsArr) {
    return await BBCModel.bulkWrite(newsArr.map(item=>{
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
