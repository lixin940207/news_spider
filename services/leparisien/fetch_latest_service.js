require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.LeParisienURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToArticlePageAndParse} = require("./common");
const {parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
moment.locale('en');

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeParisien new crawling start.'+ current_ts);
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('LeParisien got to the page.')
    await page.waitForSelector('article', {timeout: 0})
    logger.info('LeParisien loaded')
    const elementList = (await page.$$('article section#left [class*="story-preview"]'))

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    const newsResult = allNewsResult.filter(i=>i!==undefined);
    logger.info('LeParisien parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'LeParisien';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('LeParisien inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[3] === 'podcasts'){
        return;
    }
    news.imageHref = URL + await element.$eval('img', node=>node.getAttribute('src'));
    news.title.ori = processStr(await element.$eval('.story-headline', node => node.innerText));
    news.categories = determineCategory(news.title.ori);
    news.isLive = news.title.ori.startsWith('DIRECT.');
    if (news.isLive) news.title.ori = news.title.ori.slice(7,);
    news.title.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.title.ori):"";
    if ((await element.$$('.story-subheadline')).length > 0) {
        news.summary.ori = processStr(await element.$eval('.story-subheadline', node => node.innerText));
        news.summary.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.summary.ori):"";
    }
    news.newsType = NewsTypes.CardWithImage;
    if (news.isLive) {
        const {liveNewsList, article, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.article = article;
        news.publishTime = latestTime;
        news.newsType = NewsTypes.CardWithImageAndLive;
    } else {
        news.article = await goToArticlePageAndParse(browser, news.articleHref);
        news.publishTime = news.article.publishTime
    }
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





