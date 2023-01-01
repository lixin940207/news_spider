require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').ORIGINAL_URLS.France24URL;
const logger = require('../../config/logger');
const {processStr, getImageHref, ifSelectorExists} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const LANG = require('../../config/config').LANGUAGE.FRANCE24;

const BASE_URL = 'https://www.france24.com';

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('France24 new crawling start.' + current_ts);
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: "load",
    });
    logger.info('France24 got to the page.')
    await page.waitForSelector('main div[class*="t-content"]')
    logger.info('France24 loaded')
    const containerList = (await page.$$('main div[class*="t-content"] section.t-content__section-pb')).slice(0, 3);
    //div[class*="m-item-list-article"]
    const elementList = (await Promise.all(containerList.map(async node => {
        return await node.$$('div[class*="m-item-list-article"]')
    }))).flat();

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    logger.info('France24 parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult
        .filter(element => element !== undefined)
        .map(element => {
            element.platform = 'France24';
            element.displayOrder = element.ranking * 0.01 - current_ts;
            return element;
        }));
    logger.info('France24 inserting into db finish.');
    await browser.close();
}

const parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;

    news.articleHref = BASE_URL + await element.$eval('a', node => node.getAttribute('href'));
    if ([encodeURIComponent('vidéo'), encodeURIComponent('émissions')].includes(news.articleHref.split('/')[4])) {
        return undefined;
    }
    const oriTitle = processStr(await element.$eval('[class*="article__title"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = determineCategory(oriTitle);
    if (['amériques', 'asie-pacifique', 'afrique', 'moyen-orient'].includes(news.articleHref.split('/')[4])) {
        news.categories.push('World');
    } else {
        if (news.categories.length === 0) news.categories.push('France');
    }
    news.imageHref = await getImageHref(element, 'div.article__figure-wrapper img');
    news.isLive = false;
    news.newsType = NewsTypes.CardWithImage;
    news.article = await goToArticlePageAndParse(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    if (await ifSelectorExists(element, 'div.m-list-main-related')) {
        const relatedNewsElements = await element.$$('div.m-list-main-related a.m-list-main-related__article');
        news.relatedNewsList = await Promise.all(relatedNewsElements.map(async element => {
            const rNews = new NewsObject();
            rNews.articleHref = BASE_URL + await element.evaluate(node => node.getAttribute('href'));
            const oriTitle = await element.evaluate(node => node.innerText);
            rNews.title = await asyncTranslate(oriTitle, LANG);
            rNews.article = await goToArticlePageAndParse(browser, rNews.articleHref);
            return rNews;
        }));
        news.newsType = NewsTypes.CardWithImageAndSubtitle;
    }
    logger.info("parsed news " + news.articleHref, {platform: "France24"});

    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("43 1,3,5,7,9,11,13,15,17,19,21,23 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
