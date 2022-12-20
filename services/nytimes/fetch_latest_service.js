require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').ORIGINAL_URLS.NYTimeURL;
const logger = require('../../config/logger');
const {ifSelectorExists, determineCategory} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {parseArticle, parseLiveNews} = require("./common");
const {asyncTranslate} = require("../nlp_utils/translations");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const LANG = require("../../config/config").LANGUAGE.NYTimes;

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('NYTimes a new crawling start.' + current_ts);
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('NYTimes loaded.');
    await page.waitForSelector('main#site-content', {timeout: 0});
    logger.info('NYTimes got dom.');

    const blocks = await page.$$('div[data-hierarchy="feed"] div[data-hierarchy="zone"] div[class="css-17sdgpd e1ppw5w20"],' +
        'div[data-hierarchy="feed"] div[data-hierarchy="zone"] div.css-1hkhtys.e1ppw5w20');

    const newsList = [];
    for (let i = 0; i < blocks.length; i++) {
        let temp = await parseBlockNews(browser, blocks[i], i);
        newsList.push(...temp);
    }

    logger.info('NYTimes parsing all objects finish.')
    await News.bulkUpsertNews(newsList.map(element => {
        element.platform = 'NYTimes';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('NYTimes-inserting into db finish.');
    await page.close();
    await browser.close();
}

const parseBlockNews = async (browser, block, idx) => {
    const className = await block.evaluate(node => node.getAttribute('class'));
    if (className.includes('css-17tuifc')) {
        return [];
    }
    const newsInBlock = await block.$$('section.story-wrapper > a[data-uri]');
    if (newsInBlock.length === 1) {
        return [await parseSingleNews(browser, newsInBlock[0], idx)];
    } else if (newsInBlock.length > 1) {
        let res = [];
        let newsList = await Promise.all(newsInBlock.map(async element => await parseSingleNews(browser, element, idx)));
        newsList = newsList.filter(news => news !== undefined);
        if (newsList.find(news => news.isLive)) {
            res.push(...newsList.filter(news => news.isLive));
            newsList = newsList.filter(news => !news.isLive);
        }
        if (newsList.length > 0) {
            const primaryNews = newsList[0];
            if (await ifSelectorExists(block, 'picture.css-hdqqnp img')) {
                primaryNews.imageHref = await getImageHref(block, 'picture.css-hdqqnp img');
            } else {
                primaryNews.imageHref = primaryNews.article.headImageHref;
            }
            primaryNews.newsType = NewsTypes.CardWithImage;
            if (newsList.length > 1) {
                primaryNews.relatedNewsList = newsList.slice(1,);
                primaryNews.newsType = NewsTypes.CardWithImageAndSubtitle;
            }
            res.push(primaryNews);
        }
        return res;
    } else {
        return [];
    }
}

const parseValidURL = (url) => {
    url = url.split('?')[0];
    if (url.endsWith('/')) url = url.substring(0, url.length - 1);
    const hrefSplit = url.split('/');
    if (hrefSplit[3] === 'interactive' || hrefSplit[4] === 'interactive' || hrefSplit[3] === 'news-event') {
        return undefined;
    }
    return url;
}


const parseSingleNews = async (browser, element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    let href = await element.evaluate(node => node.getAttribute('href'));
    if (href === null) {
        console.log(await element.evaluate(node => node.outerHTML));
    }
    news.articleHref = parseValidURL(href);
    if (news.articleHref === undefined) return undefined;

    const hrefSplit = news.articleHref.split('/');
    news.region = hrefSplit[hrefSplit.length - 2];
    news.isLive = hrefSplit[3] === 'live';

    const oriTitle = await element.$eval('h2.indicate-hover, h3.indicate-hover', node => node.innerText);
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = determineCategory(oriTitle);
    if (await ifSelectorExists(element, 'p.summary-class')) {
        const oriSummary = await element.$eval('p.summary-class', node => node.innerText);
        news.summary = await asyncTranslate(oriSummary, LANG);
    }
    news.imageHref = await getImageHref(element, 'picture.css-hdqqnp img')
    if (news.imageHref && news.isLive) {
        news.newsType = NewsTypes.CardWithImageAndLive
    } else if (news.isLive) {
        news.newsType = NewsTypes.CardWithLive;
    } else if (news.imageHref) {
        news.newsType = NewsTypes.CardWithImage;
    } else {
        news.newsType = NewsTypes.CardWithTitleWide
    }
    if (news.isLive) {
        const {mainImageHref, liveNewsList, publishTime} = await parseLiveNews(browser, news.articleHref);
        if (news.imageHref === undefined) {
            news.imageHref = mainImageHref;
        }
        news.liveNewsList = liveNewsList;
        news.publishTime = publishTime;
    } else {
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
    }
    logger.info("parsed news " + news.articleHref, {platform: "NYT"});

    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("45 0,2,4,6,8,10,12,14,16,18,20,22 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r.stack);
                process.exit(1);
            }
        );
}
