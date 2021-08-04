require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').CHINA_NEWS_URLS.LeParisienURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");
moment.locale('en');
const BASE_URL = "https://www.leparisien.fr"

let browser;

crawl = async () => {
    logger.info('LeParisien china objects start crawling.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('#fusion-app', {timeout: 0})
    logger.info('loaded')
    const elementList = (await page.$$('#fusion-app [class*="story-preview"]'))

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises)
    const newsResult = allNewsResult.filter(i=>i!==undefined);
    console.log(newsResult.map(i=>i.publishTime));

    logger.info('LeParisien parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = "LeParisien";
        return element;
    }));
    logger.info('LeParisien inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    news.title.ori = processStr(await element.$eval('.story-headline', node => node.innerText));
    if (!determineCategory(news.title.ori).includes('China')){
        return;
    }
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    news.categories = ['China'];
    news.imageHref = BASE_URL + await element.$eval('img', node=>node.getAttribute('src'));
    news.newsType = NewsTypes.CardWithImage;

    if ((await element.$$('.story-subheadline')).length > 0) {
        news.summary.ori = processStr(await element.$eval('.story-subheadline', node => node.innerText));
        news.summary.cn = await pushToQueueAndWaitForTranslateRes(news.summary.ori);
        news.newsType = NewsTypes.CardWithImageAndSummary;
    }
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    return news;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





