const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const URL = require('../../config/config').CHINA_NEWS_URLS.BBCURL;
const {CRAWL_TIME_INTERVAL} = require('../../config/config');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const moment = require('moment-timezone');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/util");
const {parseTime, parseArticle} = require("./common");
const {ifSelectorExists, determineCategory, getImageHref} = require("../utils/util");
const BASE_URL = 'https://www.bbc.com';
const {NewsObject} = require("../utils/objects");


let browser;

crawl = async () => {
    logger.info('BBC china objects start crawling.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.')
    await page.waitForSelector('div#lx-stream', {timeout: 0})

    const news_list = await page.$$('div#lx-stream li[class*="lx-stream__post-container"]')
    logger.info('BBC-got dom.')

    let promises = [];
    for (let i = 0; i < news_list.length; i++) {
        let p = parseNews(news_list[i], i+1);
        promises.push(p);
    }
    const allNewsResult = (await Promise.all(promises)).filter(i=>i!==undefined);
    logger.info('BBC-parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "BBC";
        return element;
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx
    news.title.ori = processStr(await element.$eval('header[class*="lx-stream-post__header"]', node => node.innerText));
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    news.newsType = NewsTypes.CardWithTitleWide
    news.categories = ['China'];
    if(await ifSelectorExists(element, '.lx-stream-related-story')){
        news.imageHref = await getImageHref(element, '.lx-stream-related-story img');
        if (news.imageHref !== undefined) news.newsType = NewsTypes.CardWithImage;
        news.articleHref = BASE_URL + await element.$eval('a[class*="lx-stream-post__header-link"]', node=>node.getAttribute('href'));
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
        return news;
    }
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





