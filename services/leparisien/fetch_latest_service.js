require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.LeParisienURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {translateText} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {goToArticlePageAndParse} = require("./common");
const {parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
moment.locale('en');

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeParisien new crawling start.'+ current_ts);
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('LeParisien got to the page.')
    await page.waitForSelector('article', {timeout: 0})
    logger.info('LeParisien loaded')
    const elementList = (await page.$$('article section#left [class*="story-preview"]'))

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    const newsResult = allNewsResult.filter(i=>i!==undefined);
    logger.info('LeParisien parsing all objects finish.')
    console.log(await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'LeParisien';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    })));
    logger.info('LeParisien inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[3] === 'podcasts'){
        return;
    }
    news.imageHref = URL + await element.$eval('img', node=>node.getAttribute('src'));

    news.title.ori = await element.$eval('.story-headline', node => node.innerText);
    news.categories = determineCategory(news.title);
    news.isLive = news.title.ori.startsWith('DIRECT.');
    if (news.isLive) news.title.ori = news.title.ori.slice(7,);
    news.title.cn = await translateText(news.title.ori);
    if ((await element.$$('.story-subheadline')).length > 0) {
        news.summary.ori = await element.$eval('.story-subheadline', node => node.innerText);
        news.summary.cn = await translateText(news.summary.ori);
    }
    news.newsType = NewsTypes.CardWithImage;
    if (news.isLive) {
        [news.liveNewsList, news.article] = await parseLiveNews(browser, news.articleHref);
        news.newsType = NewsTypes.CardWithImageAndLive;
    } else {
        news.article = await goToArticlePageAndParse(browser, news.articleHref);
        news.publishTime = news.article.publishTime
    }
    return news;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





