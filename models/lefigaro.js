const BaseSchema = require('./base_schema');
const mongoose = require('mongoose');


const LeFigaroSchema = new BaseSchema({}, {timestamps: true});

const LeFigaroModel = mongoose.model('lefigaro_news', LeFigaroSchema);

async function list() {
    return await LeFigaroModel.find({});
}

async function getNewsById(id) {
    return await LeFigaroModel.findById(id);
}

async function getNewsByHref(href) {
    return await LeFigaroModel.findOne({articleHref: href});
}

async function createNews(news) {
    return await LeFigaroModel.create(news);
}

async function upsertNews(news) {
    if (await LeFigaroModel.findOne({articleHref: news.articleHref})){
        return await LeFigaroModel.updateOne(
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
        return await LeFigaroModel.create(news);
    }
}

async function bulkUpsertNews(newsArr) {
    return await LeFigaroModel.bulkWrite(newsArr.map(item=>{
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

