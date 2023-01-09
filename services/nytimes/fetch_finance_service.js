require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').FINANCE.NYTimesURL;
const logger = require('../../config/logger');
const {parseArticle} = require("./common");
const {NewsObject} = require("../utils/objects");
const {getImageHref, determineCategory} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const BASE_URL = "https://www.nytimes.com/";
const LANG = 'en';

let browser;

const crawl = async () => {
    logger.info('NYTimes Finance objects start crawling.')
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('NYTimes Finance loaded.');
    await page.waitForSelector('section#collection-business-economy', {timeout: 0});

    const news_list = await page.$$(
        'section#collection-business-economy section#stream-panel ol[aria-live="off"] li');
    logger.info('NYTimes Finance got dom.');

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i + 1));
    }

    logger.info('NYTimes Finance parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        element.platform = "NYTimes";
        return element;
    }));
    logger.info('NYTimes Finance inserted into db.')
    await page.close();
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    const oriTitle = await element.$eval('a h2', node => node.innerText);
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = ['Finance', ...determineCategory(oriTitle)];

    news.articleHref = BASE_URL + await element.$eval('a', node => node.getAttribute('href'))
    const oriSummary = await element.$eval('a > p', node => node.innerText);
    news.summary = await asyncTranslate(oriSummary, LANG);
    news.imageHref = await getImageHref(element, 'a figure img');
    news.newsType = NewsTypes.CardWithImageAndSummary;

    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    logger.info("parsed news " + news.articleHref, {platform: "NYT Finance"});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("36 0,2,4,6,8,10,12,14,16,18,20,22 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r.stack);
                process.exit(1);
            }
        );
}
