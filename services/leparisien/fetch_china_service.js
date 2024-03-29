require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const { scrollPageToBottom } = require('puppeteer-autoscroll-down')
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').CHINA_NEWS_URLS.LeParisienURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");
const LANG = require("../../config/config").LANGUAGE.LeParisien;

moment.locale('en');
const BASE_URL = "https://www.leparisien.fr"

let browser;

const crawl = async () => {
    logger.info('LeParisien china start crawling.')
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    // Scroll to the very top of the page
    await page.evaluate(_ => {
        window.scrollTo(0, 0);
    });
    await scrollPageToBottom(page);

    logger.info('LeParisien china got to the page.')
    await page.waitForSelector('#fusion-app', {timeout: 0})
    logger.info('LeParisien china loaded')
    const elementList = (await page.$$('#fusion-app [class*="story-preview"]'))

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    const newsResult = allNewsResult.filter(i => i !== undefined);

    logger.info('LeParisien China parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = "LeParisien";
        return element;
    }));
    logger.info('LeParisien China inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    const oriTitle = processStr(await element.$eval('.story-headline', node => node.innerText));
    if (!determineCategory(oriTitle).includes('China')) {
        return;
    }
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = ['China', ...determineCategory(oriTitle)];
    news.imageHref = BASE_URL + await element.$eval('img', node => node.getAttribute('src'));
    news.newsType = NewsTypes.CardWithImage;

    if ((await element.$$('.story-subheadline')).length > 0) {
        const oriSummary = processStr(await element.$eval('.story-subheadline', node => node.innerText));
        news.summary = await asyncTranslate(oriSummary, LANG);
        news.newsType = NewsTypes.CardWithImageAndSummary;
    }
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    logger.info("parsed news " + news.articleHref, {platform: "LeParisien China"});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("21 0,2,4,6,8,10,12,14,16,18,20,22 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
