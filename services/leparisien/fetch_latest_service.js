require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').ORIGINAL_URLS.LeParisienURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr, ifSelectorExists} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToArticlePageAndParse} = require("./common");
const {parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const LANG = require("../../config/config").LANGUAGE.LeParisien;

moment.locale('en');

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeParisien new crawling start.' + current_ts);
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
    const newsResult = allNewsResult.filter(i => i !== undefined);
    logger.info('LeParisien parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'LeParisien';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('LeParisien inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[3] === 'podcasts') {
        return;
    }
    if (await ifSelectorExists(element, 'a span.abo')) { // skip news needs abonement
        return;
    }
    news.imageHref = URL + await element.$eval('img', node => node.getAttribute('src'));
    let oriTitle = processStr(await element.$eval('.story-headline', node => node.innerText));
    news.categories = determineCategory(oriTitle);
    if (news.articleHref.split('/')[3] === 'international') {
        news.categories.push('World');
    } else {
        news.categories.push('France');
    }
    news.isLive = oriTitle.startsWith('DIRECT.');
    if (news.isLive) {
        oriTitle = oriTitle.slice(7,);
    }
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    if ((await element.$$('.story-subheadline')).length > 0) {
        const oriSummary = processStr(await element.$eval('.story-subheadline', node => node.innerText));
        news.summary = await asyncTranslate(oriSummary, LANG);
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
        if (news.imageHref.includes('lazy-loading')) {
            news.imageHref = news.articleHref.headImageHref;
        }
    }
    logger.info("parsed news " + news.articleHref, {platform: "LeParisien"});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("28 0,2,4,6,8,10,12,14,16,18,20,22 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
