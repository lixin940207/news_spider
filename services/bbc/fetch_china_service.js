const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require('../../config/config');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const moment = require('moment-timezone');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {parseTime, parseArticle} = require("./common");
const {ifSelectorExists, determineCategory, getImageHref} = require("../utils/util");
const {NewsObject} = require("../utils/objects");

const BASE_URL = 'https://www.bbc.com';
const CHINA_URL = require('../../config/config').CHINA_NEWS_URLS.BBCURL;
const TECH_URL = require('../../config/config').TECHNOLOGY.BBCURL;


let browser;

crawl = async (URL, category) => {
    logger.info('BBC start crawling.', {
        category,
        URL,
    });
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.', {
        category,
    })
    await page.waitForSelector('div#lx-stream', {timeout: 0})

    const news_list = await page.$$('div#lx-stream li[class*="lx-stream__post-container"]')
    logger.info('BBC-got dom.', {
        category,
    })

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i+1, category));
    }
    allNewsResult = allNewsResult.filter(i => i!==undefined);
    logger.info('BBC-parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "BBC";
        return element;
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx, category) => {
    const news = new NewsObject();
    news.ranking = idx
    news.title.ori = processStr(await element.$eval('header[class*="lx-stream-post__header"]', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";
    news.newsType = NewsTypes.CardWithTitleWide
    news.categories = [category];
    if(await ifSelectorExists(element, '.lx-stream-related-story')){
        news.imageHref = await getImageHref(element, '.lx-stream-related-story img');
        if (news.imageHref !== undefined) news.newsType = NewsTypes.CardWithImage;
        news.articleHref = BASE_URL + await element.$eval('a[class*="lx-stream-post__header-link"]', node=>node.getAttribute('href'));
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
        return news;
    }
    logger.info("parsed news ", news.title.ori);
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
crawl(CHINA_URL, "China")
    .then(s => process.exit())
    .catch(r => {
            logger.error(r);
            process.exit(1);
        }
    );

// crawl(TECH_URL, "Tech")
//     .then(s => process.exit())
//     .catch(r => {
//             logger.error(r);
//             process.exit(1);
//         }
//     );



