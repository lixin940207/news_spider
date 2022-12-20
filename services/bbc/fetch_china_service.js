const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const {asyncTranslate} = require("../nlp_utils/translations");
const {parseArticle} = require("./common");
const {processStr, ifSelectorExists, getImageHref, determineCategory} = require("../utils/util");
const {NewsObject} = require("../utils/objects");

const BASE_URL = 'https://www.bbc.com';
const CHINA_URL = require('../../config/config').CHINA_NEWS_URLS.BBCURL;
const LANG = require('../../config/config').LANGUAGE.BBC;

let browser;

const crawl = async (URL, category) => {
    logger.info('BBC start crawling.', {
        category,
        URL,
    });
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.', {
        category,
    })
    await page.waitForSelector('div#lx-stream', {timeout: 0})

    const news_list = await page.$$('div#lx-stream li[class*="lx-stream__post-container"]')
    logger.info('BBC-got dom.', {
        category,
    })

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i + 1, category));
    }
    allNewsResult = allNewsResult.filter(i => i !== undefined);
    logger.info('BBC-parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element => {
        element.platform = "BBC";
        return element;
    }));
    logger.info('BBC-inserted into db.', {category})
    await page.close();
    await browser.close();
}


const parseNews = async (element, idx, category) => {
    const news = new NewsObject();
    news.ranking = idx

    const oriTitle = processStr(await element.$eval('header[class*="lx-stream-post__header"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);

    news.newsType = NewsTypes.CardWithTitleWide
    news.categories = [category, ...determineCategory(oriTitle)];
    if (await ifSelectorExists(element, '.lx-stream-related-story')) {
        news.imageHref = await getImageHref(element, '.lx-stream-related-story img');
        if (news.imageHref !== undefined) news.newsType = NewsTypes.CardWithImage;
        news.articleHref = BASE_URL + await element.$eval('a[class*="lx-stream-post__header-link"]', node => node.getAttribute('href'));
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
        logger.info("parsed news " + news.articleHref, {platform: "BBC China"});
        return news;
    }
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("0 1,3,5,7,9,11,13,15,17,19,21,23 * * *", () => crawl(CHINA_URL, "China"));
} else {
    crawl(CHINA_URL, "China")
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
