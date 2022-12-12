require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').CHINA_NEWS_URLS.BFMURL;
const BASE_URL = require('../../config/config').ORIGINAL_URLS.BFMURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToDetailPageAndParse} = require("./common");
const {ifSelectorExists, getImageHref, determineCategory} = require("../utils/util");
const LANG = require('../../config/config').LANGUAGE.BFM;

moment.locale('en');

let browser;

const crawl = async () => {
    logger.info('BFM china objects start crawling.')
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('BFM got to the page.')
    await page.waitForSelector('main', {timeout: 0})
    logger.info('BFM loaded')
    const elementList = await page.$$('article[class*="content_item content_type"]');

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    const newsResult = allNewsResult.filter(i => i !== undefined);
    console.log(newsResult.map(i => i.publishTime));

    logger.info('BFM parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = "BFM";
        return element;
    }));
    logger.info('BFM inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    let oriTitle;
    if (await ifSelectorExists(element, '.title_une_item')) {
        oriTitle = await element.$eval('.title_une_item', node => node.innerText);
    } else {
        oriTitle = await element.$eval('.content_item_title', node => node.innerText);
    }
    if (!determineCategory(oriTitle).includes('China')) {
        return;
    }
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = ['China', ...determineCategory(oriTitle)];
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.startsWith('/')) {
        news.articleHref = BASE_URL + news.articleHref;
    }
    news.imageHref = await getImageHref(element);
    news.newsType = NewsTypes.CardWithImage;
    if (await ifSelectorExists(element, '[class*="item_chapo"]')) {
        const oriSummary = await element.$eval('[class*="item_chapo"]', node => node.innerText);
        news.summary = await asyncTranslate(oriSummary, LANG);
        news.newsType = NewsTypes.CardWithImageAndSummary;
    }
    news.isVideo = (await element.evaluate(node => node.getAttribute('class'))).includes('content_type_video');
    news.article = await goToDetailPageAndParse(browser, news.articleHref);
    if (news.article === null) {
        return;
    }
    news.publishTime = news.article.publishTime;

    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("23 1,3,5,7,9,11,13,15,17,19,21,23 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}




