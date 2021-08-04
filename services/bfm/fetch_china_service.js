require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').CHINA_NEWS_URLS.BFMURL;
const BASE_URL = require('../../config/config').ORIGINAL_URLS.BFMURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {goToDetailPageAndParse} = require("./common");
const {goToArticlePageAndParse} = require("./common");
const {ifSelectorExists} = require("../utils/util");
const {determineCategory} = require("../utils/util");
moment.locale('en');

let browser;

crawl = async () => {
    logger.info('BFM china objects start crawling.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('BFM got to the page.')
    await page.waitForSelector('main', {timeout: 0})
    logger.info('BFM loaded')
    const elementList = await page.$$('article[class*="content_item content_type"]');

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    const newsResult = allNewsResult.filter(i=>i!==undefined);
    console.log(newsResult.map(i=>i.publishTime));

    logger.info('BFM parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = "BFM";
        return element;
    }));
    logger.info('BFM inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    if (await ifSelectorExists(element, '.title_une_item')){
        news.title.ori = await element.$eval('.title_une_item', node=>node.innerText);
    }else{
        news.title.ori = await element.$eval('.content_item_title', node => node.innerText);
    }
    if (!determineCategory(news.title.ori).includes('China')){
        return;
    }
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    news.categories = ['China'];
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.startsWith('/')) news.articleHref = BASE_URL + news.articleHref;
    news.imageHref = await getImageHref(element);
    news.newsType = NewsTypes.CardWithImage;
    if (await ifSelectorExists(element, '[class*="item_chapo"]')){
        news.summary.ori = await element.$eval('[class*="item_chapo"]', node=>node.innerText);
        news.summary.cn = await pushToQueueAndWaitForTranslateRes(news.summary.ori);
        news.newsType = NewsTypes.CardWithImageAndSummary;
    }
    news.isVideo = (await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_video');
    news.article = await goToDetailPageAndParse(browser, news.articleHref);
    if (news.article === null){
        return;
    }
    news.publishTime = news.article.publishTime;

    return news;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





