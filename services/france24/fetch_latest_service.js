require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.France24URL;
const logger = require('../../config/logger');
const {processStr, getImageHref} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");

const BASE_URL = 'https://www.france24.com';

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('France24 new crawling start.'+ current_ts);
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: "load",
    });
    logger.info('France24 got to the page.')
    await page.waitForSelector('main div[class*="t-content"]')
    logger.info('France24 loaded')
    const containerList = (await page.$$('main div[class*="t-content"] section.t-content__section-pb')).slice(0, 3);
    //div[class*="m-item-list-article"]
    const elementList = (await Promise.all(containerList.map(async node=> {
        return await node.$$('div[class*="m-item-list-article"]')
    }))).flat();

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('France24 parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult
        .filter(element => element !== undefined)
        .map(element=>{
        element.platform = 'France24';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('France24 inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;

    news.articleHref = BASE_URL + await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[4] === encodeURIComponent('vidéo')) {
        return undefined;
    }
    news.title.ori = processStr(await element.$eval('[class*="article__title"]', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";
    news.categories = determineCategory(news.title.ori);
    news.imageHref = await getImageHref(element, 'div.article__figure-wrapper img');
    news.isLive = false;
    news.newsType = NewsTypes.CardWithImage;
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    return news;
}

// schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
crawl()
    .then(s => process.exit())
    .catch(r => {
            logger.error(r);
            process.exit(1);
        }
    );




