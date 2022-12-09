require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').CHINA_NEWS_URLS.NYTimesURL;
const logger = require('../../config/logger');
const {parseChineseArticle} = require("./common");
const {NewsObject} = require("../utils/objects");
const {getImageHref, determineCategory} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const BASE_URL = 'https://cn.nytimes.com';
const LANG = 'zh';

let browser;

crawl = async () => {
    logger.info('NYTimes china objects start crawling.')
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('NYTimes loaded.');
    await page.waitForSelector('div#sectionWrapper', {timeout: 0});

    const news_list = await page.$$(
        'div#sectionWrapper div#sectionLeadPackage div[class*="collection-item"], ' +
        'div#sectionWrapper ul.autoList > li[class*="autoListStory"]');
    logger.info('NYTimes got dom.');

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i + 1));
    }

    logger.info('NYTimes-parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        element.platform = "NYTimes";
        return element;
    }));
    logger.info('NYTimes-inserted into db.')
    await page.close();
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    const oriTitle = await element.$eval('h3', node => node.innerText);
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = ['China', ...determineCategory(oriTitle)];

    news.articleHref = BASE_URL + await element.$eval('a', node => node.getAttribute('href'))
    const oriSummary = await element.$eval('p.summary', node => node.innerText);
    news.summary = await asyncTranslate(oriSummary, LANG);
    news.imageHref = await getImageHref(element);
    if (!news.imageHref.startsWith('http')) {
        news.imageHref = await element.$eval('img', node => node.getAttribute('data-url'));
    }
    news.newsType = NewsTypes.CardWithImageAndSummary;

    news.article = await parseChineseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("39 * * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
