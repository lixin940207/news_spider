require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').CHINA_NEWS_URLS.France24URL;
const logger = require('../../config/logger');
const {processStr} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");
const LANG = require('../../config/config').LANGUAGE.FRANCE24;

const BASE_URL = 'https://www.france24.com';

let browser;

const crawl = async () => {
    logger.info('France24 china objects start crawling.')
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('main div[class*="t-content"]', {timeout: 0})
    logger.info('loaded')
    const containerList = (await page.$$('main div[class*="t-content"] section.t-content__section-pb')).slice(0, 3);
    const elementList = (await Promise.all(containerList.map(async node => {
        return await node.$$('div[class*="m-item-list-article"]')
    }))).flat();

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i))
    }
    allNewsResult = allNewsResult.filter(i => i !== undefined);

    logger.info('France24 parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        element.platform = "France24";
        return element;
    }));
    logger.info('France24 inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;

    const oriTitle = processStr(await element.$eval('[class*="article__title"]', node => node.innerText));
    if (!determineCategory(oriTitle).includes('China')) {
        return;
    }
    news.categories = ['China', determineCategory(oriTitle)];
    news.title = await asyncTranslate(oriTitle, LANG);
    news.articleHref = BASE_URL + await element.$eval('a', node => node.getAttribute('href'));
    if ((await element.$$('img[src]')).length > 0) {
        news.imageHref = (await element.$eval('img[src]', node => node.innerText)).split('"')[1];
    }
    news.newsType = NewsTypes.CardWithImage
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("15 * * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}




