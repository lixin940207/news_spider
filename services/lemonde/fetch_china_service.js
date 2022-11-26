require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const logger = require("../../config/logger");
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getImageHref, ifSelectorExists} = require("../utils/util");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");
const URL = require('../../config/config').CHINA_NEWS_URLS.LeMondeURL;
const {goToArticlePageAndParse} = require('./common');

let browser;

crawl = async () => {
    logger.info('LeMonde china objects start crawling.'+ Date.now())
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('LeMonde got to the page.')
    await page.waitForSelector('section#river')
    logger.info('loaded')
    const elementList = await page.$$('section#river div.thread')

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    logger.info('LeMonde parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "LeMonde";
        return element;
    }));
    logger.info('LeMonde-inserting into db finish.')
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a.teaser__link', node => node.getAttribute('href'));
    news.title.ori = processStr(await element.$eval('.teaser__title', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.title.ori):"";
    news.imageHref = await getImageHref(element, 'picture source');
    news.categories = ['China'];
    news.newsType = NewsTypes.CardWithImage;
    if (await ifSelectorExists(element,'.teaser__desc')) {
        news.summary.ori = processStr(await element.$eval('.teaser__desc', node => node.innerText));
        news.summary.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.summary.ori):"";
        news.newsType = NewsTypes.CardWithImageAndSummary;
    }
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime

    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("27 * * * *", crawl);
} else {
    crawl()
        .then(s => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
