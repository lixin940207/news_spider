require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').CHINA_NEWS_URLS.NYTimesURL;
const logger = require('../../config/logger');
const {parseChineseArticle} = require("./common");
const {NewsObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const BASE_URL = 'https://cn.nytimes.com';

let objs = {};
let browser;

crawl = async () => {
    logger.info('NYTimes china objects start crawling.')
    objs = {}
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
        allNewsResult.push(await parseNews(news_list[i], i+1));
    }

    logger.info('NYTimes-parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element=>{
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
    news.title.ori = await element.$eval('h3', node => node.innerText);
    news.title.cn = news.title.ori;
    news.articleHref = BASE_URL + await element.$eval('a', node=>node.getAttribute('href'))
    news.summary.ori = await element.$eval('p.summary', node => node.innerText);
    news.summary.cn = news.summary.ori;
    news.imageHref = await getImageHref(element);
    if (!news.imageHref.startsWith('http')){
        news.imageHref = await element.$eval('img',node=>node.getAttribute('data-url'));
    }
    news.newsType = NewsTypes.CardWithImageAndSummary;
    news.categories = ['China'];

    news.article = await parseChineseArticle(browser, news.articleHref);
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


