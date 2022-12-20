require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').ORIGINAL_URLS.BFMURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr, getImageHref, determineCategory} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToDetailPageAndParse, parseLiveNews} = require("./common");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const LANG = require('../../config/config').LANGUAGE.BFM;

moment.locale('en');

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('BFM new crawling start.' + current_ts)
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
    const elementList = (await page.$$('article[class*="une_item"], article[class*="duo_liste"]'))

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    const newsResult = allNewsResult.filter(i => i !== undefined);

    logger.info('BFM parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'BFM';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('BFM inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    if ((await element.evaluate(node => node.getAttribute('class'))).includes('content_type_externe')) {
        return;
    }
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.startsWith('/')) news.articleHref = URL + news.articleHref;
    news.imageHref = await getImageHref(element);
    let oriTitle;
    if ((await element.$$('.title_une_item')).length > 0) {
        oriTitle = processStr(await element.$eval('.title_une_item', node => node.innerText));
    } else {
        oriTitle = processStr(await element.$eval('.content_item_title', node => node.innerText));
    }
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = determineCategory(oriTitle);
    news.isLive = (await element.evaluate(node => node.getAttribute('class'))).includes('content_type_live');
    news.isVideo = (await element.evaluate(node => node.getAttribute('class'))).includes('content_type_video');
    if (news.isLive && oriTitle.startsWith('EN DIRECT - ')) {
        oriTitle = oriTitle.split('EN DIRECT - ')[1];
    }
    news.title = await asyncTranslate(oriTitle, LANG);

    news.newsType = NewsTypes.CardWithImage;
    if (news.isLive) {
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
        news.newsType = NewsTypes.CardWithImageAndLive;
    } else {
        const article = await goToDetailPageAndParse(browser, news.articleHref);
        if (article !== null) {
            news.article = article;
            news.publishTime = news.article.publishTime
        } else {
            return;
        }
    }
    logger.info("parsed news " + news.articleHref, {platform: "BFM"});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("29 1,3,5,7,9,11,13,15,17,19,21,23 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
