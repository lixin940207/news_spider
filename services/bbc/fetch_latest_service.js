const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const URL = require('../../config/config').ORIGINAL_URLS.BBCURL;
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const {processStr} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {ifSelectorExists} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {parseArticle, parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const BASE_URL = "https://www.bbc.com";
const LANG = require('../../config/config').LANGUAGE.BBC;

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('BBC-a new crawling start.' + current_ts)
    browser = await puppeteer.launch({
        args: ['--no-sandbox', '--no-zygote', '--single-process'],
    });
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.')
    await page.waitForSelector('div[aria-label="Top Stories"]', {timeout: 0})

    const news_list = await page.$$('div[aria-label="Top Stories"] div.nw-p-oat div[data-entityid="container-top-stories#1"],' +
        'div[aria-label="Top Stories"] div[class*="nw-c-top-stories-primary__story"],' +
        'div[aria-label="Top Stories"] div[class*="nw-c-top-stories__secondary-item"],' +
        'div[aria-label="Top Stories"]  div[class*="nw-c-top-stories__tertiary-items"]')
    logger.info('BBC-got dom.')

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i));
    }
    logger.info('BBC-parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        element.platform = 'BBC';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}

const getNewsType = async (element) => {
    return await element.evaluate(node => {
        const elementClass = node.getAttribute('class').toString();
        let newsType;
        if (elementClass.includes('nw-c-top-stories-primary__story') || node.getAttribute('data-entityid')?.toString() === "container-top-stories#1") {
            newsType = 1;
        } else if (elementClass.includes('nw-c-top-stories__tertiary-items')) {
            newsType = 3;
        } else {
            newsType = 2;
        }
        return newsType;
    });
}

const parseNews = async (element, idx) => {
    const newsType = await getNewsType(element);
    const news = await getCommonPart(element);
    news.ranking = idx;
    if (newsType === 1) {
        const relatedElementList = await element.$$('li[class*="nw-c-related-story"] a');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            const articleHref = await element.evaluate(node => node.getAttribute('href'));
            const title = processStr(await element.evaluate(node => node.innerText));
            return {
                title: await asyncTranslate(title, LANG),
                article: await parseArticle(browser, BASE_URL + articleHref)
            }
        }))
        news.newsType = NewsTypes.CardWithImageAndSubtitle;
        if (news.relatedNewsList.length < 3 && news.relatedNewsList.map(news => news.title.en.length).reduce((a, b) => a + b, 0) < 80) {
            news.newsType = NewsTypes.CardWithImage;
        }
        if (news.isLive) {
            news.newsType = NewsTypes.CardWithImageAndLive
        }
    } else if (newsType === 2) {
        if (news.isLive) {
            news.newsType = NewsTypes.CardWithLive;
        } else {
            news.newsType = NewsTypes.CardWithImage;
        }
    } else {
        if (news.isLive) {
            news.newsType = NewsTypes.CardWithLive;
        } else {
            news.newsType = NewsTypes.CardWithTitleWide;
        }
    }
    return news;
}

const getCommonPart = async (element) => {
    const news = new NewsObject();
    // const content_element = await element.$('div.gs-c-promo-body');
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (!news.articleHref.startsWith('http')) {
        news.articleHref = BASE_URL + news.articleHref;
    }
    logger.debug("started to parse news", {
        articleHref: news.articleHref,
        platform: 'BBC',
    })
    // const image_element = await element.$('div.gs-c-promo-image');
    if (await ifSelectorExists(element, 'img')) {
        news.imageHref = (await element.$eval('img', node => {
            if (!(node.getAttribute('src').startsWith('http'))) {
                return node.getAttribute('data-src');
            }
            return node.getAttribute('src');
        })).replace('{width}', '240');
    }
    const oriTitle = processStr(await element.$eval('[class*="nw-o-link-split__text"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = ['World', ...determineCategory(oriTitle)];
    if ((await element.$$('p[class*="gs-c-promo-summary"]')).length > 0) {
        const oriSummary = processStr(await element.$eval('p[class*="gs-c-promo-summary"]', node => node.innerText));
        news.summary = await asyncTranslate(oriSummary, LANG);
    }
    if ((await element.$$('time[class*="qa-status-date"][datetime]')).length > 0) {
        news.publishTime = new Date(await element.$eval('time[class*="qa-status-date"][datetime]', node => node.getAttribute('datetime')));
    }
    if ((await element.$$('a[class*="gs-c-section-link"]')).length > 0) {
        news.region = await element.$eval('a[class*="gs-c-section-link"]', node => node.innerText);
    }
    // news.isVideo = (await element.$$('span[class*="gs-c-media-indicator"]')).length > 0;
    news.isLive = (await element.$$('[class*="gs-c-live-pulse"]')).length > 0;
    if (!news.isLive) {
        news.article = await parseArticle(browser, news.articleHref);
    } else if (news.isLive) {
        const {liveNewsList, latestTime, mainImageHref} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
        if (news.imageHref === undefined) {
            news.imageHref = mainImageHref;
        }
        news.newsType = NewsTypes.CardWithImageAndLive;
    }
    logger.info("parsed news " + news.articleHref, {platform: "BBC"});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("7 1,3,5,7,9,11,13,15,17,19,21,23 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r.stack);
                process.exit(1);
            }
        );
}
