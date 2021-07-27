const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const URL = require('../../config/config').ORIGINAL_URLS.BBCURL;
const {CRAWL_TIME_INTERVAL} = require('../../config/config');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const {translateText} = require("../utils/util");
const {translate} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {parseArticle, parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
const BASE_URL = "https://www.bbc.com";

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('BBC-a new crawling start.'+ current_ts )
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.')
    await page.waitForSelector('div[aria-label="Top Stories"]', {timeout: 0})

    const news_list = await page.$$('div[aria-label="Top Stories"] div[class*="nw-c-top-stories-primary__story"],' +
        'div[aria-label="Top Stories"] div[class*="nw-c-top-stories__secondary-item"],' +
        'div[aria-label="Top Stories"]  div[class*="nw-c-top-stories__tertiary-items"]')
    logger.info('BBC-got dom.')

    let promises = [];
    for (let i = 0; i < news_list.length; i++) {
        let p = parseNews(news_list[i], i);
        promises.push(p);
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('BBC-parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = 'BBC';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}

getNewsType = async (element) => {
    return await element.evaluate(node => {
        const elementClass = node.getAttribute('class').toString();
        let newsType;
        if (elementClass.includes('nw-c-top-stories-primary__story')) {
            newsType = 1;
        } else if (elementClass.includes('nw-c-top-stories__tertiary-items')) {
            newsType = 3;
        } else {
            newsType = 2;
        }
        return newsType;
    });
}


parseNews = async (element, idx) => {
    const newsType = await getNewsType(element);
    const news = await getCommonPart(element);
    news.ranking = idx;
    if (newsType === 1) {
        const relatedElementList = await element.$$('li[class*="nw-c-related-story"] a');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            const articleHref = await element.evaluate(node=>node.getAttribute('href'));
            return {
                title: {ori: await element.evaluate(node=>node.innerText)},
                article: await parseArticle(browser, BASE_URL + articleHref)
            }
        }))
        news.newsType = NewsTypes.CardWithImageAndSubtitle;
    } else if (newsType === 2) {
        news.newsType = NewsTypes.CardWithImage;
    } else {
        news.newsType = NewsTypes.CardWithTitleWide;
    }
    return news;
}


getCommonPart = async (element) => {
    const news = new NewsObject();
    const content_element = await element.$('div.gs-c-promo-body');
    const image_element = await element.$('div.gs-c-promo-image');
    if (image_element !== null){
        news.imageHref = (await image_element.$eval('img', node => {
            if (!(node.getAttribute('src').startsWith('http'))){
                return node.getAttribute('data-src');
            }
            return node.getAttribute('src');
        })).replace('{width}', '240');
    }
    news.title.ori = await content_element.$eval('[class*="nw-o-link-split__text"]', node=>node.innerText);
    news.title.cn = await translateText(news.title.ori);
    news.categories = determineCategory(news.title.ori);
    news.articleHref = BASE_URL + await content_element.$eval('a', node => node.getAttribute('href'));
    if ((await content_element.$$('p[class*="gs-c-promo-summary"]')).length > 0)
    {
        news.summary.ori = await content_element.$eval('p[class*="gs-c-promo-summary"]', node => node.innerText);
        news.summary.cn = await translateText(news.summary.ori);
    }
    if ((await content_element.$$('time[datetime]')).length > 0) {
        news.publishTime = new Date(await content_element.$eval('time[datetime]', node => node.getAttribute('datetime')));
    }
    if((await content_element.$$('a[class*="gs-c-section-link"]')).length > 0) {
        news.region = await content_element.$eval('a[class*="gs-c-section-link"]', node => node.innerText);
    }
    news.isVideo = (await content_element.$$('span[class*="gs-c-media-indicator"]')).length > 0;
    news.isLive = (await content_element.$$('[class*="gs-c-live-pulse"]')).length > 0;
    if (!news.isVideo && !news.isLive) {
        news.article = await parseArticle(browser, news.articleHref);
    } else if (news.isLive){
        news.liveNewsList = await parseLiveNews(browser, news.articleHref);
        news.newsType = NewsTypes.CardWithImageAndLive
    }
    return news;
}




schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





