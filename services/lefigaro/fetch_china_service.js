const puppeteer = require('puppeteer');
const logger = require('../../config/logger');
require('../mongodb_connection');
const URL = require('../../config/config').CHINA_NEWS_URLS.LeFigaroURL;
const NewsTypes = require("../../models/news_type_enum");
const News = require('../../models/news')
const schedule = require("node-schedule");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {parseArticle} = require("./common");
const {ifSelectorExists, determineCategory} = require("../utils/util");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");

let browser;

crawl = async () => {
    logger.info('LeFigaro china objects start crawling.')
    browser = await puppeteer.launch({timeout:0});
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'load', timeout: 0});
    console.log('got to the page.')
    await page.waitForSelector('#content-wrapper', {timeout: 0})
    console.log('loaded')
    const elementList = await page.$$('#content-wrapper li.page-tag-item')

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    console.log(allNewsResult.map(i=>i.publishTime));
    logger.info('LeFigaro parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.flat().map(element=>{
        element.platform = "LeFigaro";
        return element;
    }));
    logger.info('LeFigaro-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.title.ori = await element.$eval('[itemprop="name"]', node => node.innerText);
    news.categories = ['China'];
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    news.newsType = NewsTypes.CardWithTitleWide;
    news.imageHref = await getImageHref(element, '.photo img');
    if (news.imageHref !== undefined){
        news.newsType = NewsTypes.CardWithImage;
    }
    if (await ifSelectorExists(element, 'p')){
        news.summary.ori = await element.$eval('p', node => node.innerText);
        news.newsType = news.imageHref!==undefined?NewsTypes.CardWithImageAndSummary:NewsTypes.CardWithTitleIntro;
    }
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    return news;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);


