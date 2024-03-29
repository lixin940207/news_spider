require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const URL = require('../../config/config').ORIGINAL_URLS.LeMondeURL;
const logger = require('../../config/logger');
const {processStr, getImageHref} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {determineCategory} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");
const {goToArticlePageAndParse, parseLiveNews} = require('./common');
const LANG = require("../../config/config").LANGUAGE.LeMonde;

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeMonde new crawling start.' + current_ts);
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('LeMonde got to the page.')
    await page.waitForSelector('section[class*="zone--homepage"]', {timeout: 0})
    logger.info('LeMonde loaded')
    const elementList = await page.$$('section[class*="zone--homepage"] > section > div[class*="article"]')

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        let tmp;
        try {
            tmp = await parseNews(elementList[i], i);
        } catch (e) {
            logger.error(e);
            try {
                tmp = await parseNews(elementList[i], i);
            } catch (e) {
                logger.error(e);
                logger.log('skipped news');
            }
        }
        allNewsResult.push(tmp);
    }
    allNewsResult = allNewsResult.flat().filter(news => news !== undefined && !isNaN(news.publishTime));
    allNewsResult = allNewsResult.map(element => {
        element.platform = 'LeMonde';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    })
    logger.info('LeMonde parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult);
    logger.info('LeMonde inserting into db finish.')
    await browser.close();
}

const parseNews = async (element, idx) => {
    const hasRelate = await ifSelectorExists(element, 'ul[class*="article__related"]');
    if ((await ifSelectorExists(element, 'span.icon__premium')) && !hasRelate) return;
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (['visuel', 'video'].includes(news.articleHref.split('/')[4])) {
        return undefined;
    }
    const oriTitle = processStr(await element.$eval('.article__title', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = determineCategory(oriTitle);
    if (news.articleHref.split('/')[3] === 'international') {
        news.categories.push('World');
    } else {
        news.categories.push('France');
    }
    news.newsType = NewsTypes.CardWithTitleWide;
    if (await ifSelectorExists(element, '.article__desc')) {
        const oriSummary = processStr(await element.$eval('.article__desc', node => node.innerText));
        news.summary = await asyncTranslate(oriSummary, LANG);
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    let hasImage = false;
    news.imageHref = await getImageHref(element, 'picture.article__media img', 1);
    if (news.imageHref !== undefined) {
        hasImage = true;
        news.newsType = NewsTypes.CardWithImage;
    }
    if ((await element.evaluate(node => node.getAttribute('class'))).includes('article--main')) {
        const mainArticleWrapper = (await element.$$('a'))[0];
        news.isLive = await ifSelectorExists(mainArticleWrapper, '[class*="flag-live-cartridge"]');
    } else {
        news.isLive = (await element.$$('[class*="flag-live-cartridge"]')).length > 0;
    }
    if (news.isLive) {
        const oriTitle = processStr(await element.$eval('.article__title', node => node.innerText));
        news.title = await asyncTranslate(oriTitle, LANG);
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
        news.newsType = hasImage ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
    } else {
        news.article = await goToArticlePageAndParse(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
        if (news.imageHref === undefined) {
            news.imageHref = news.article.mainImageHref;
        }
    }
    if (hasRelate) {
        const relatedElementList = await element.$$('ul[class*="article__related"] li a');
        if (news.isLive) {
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if ((await element.$$('[class*="flag-live-cartridge"]')).length > 0) {
                    const articleHref = await element.evaluate(node => node.getAttribute('href'));
                    const title = processStr(await element.evaluate(node => node.innerText));
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref)
                    return {
                        title: await asyncTranslate(title, LANG),
                        ranking: idx,
                        isLive: true,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i => i !== undefined);
            let listNews = await Promise.all(relatedElementList.map(async element => {
                if ((await element.$$('[class*="flag-live-cartridge"]')).length === 0) {
                    const articleHref = await element.evaluate(node => node.getAttribute('href'));
                    if (await ifSelectorExists(element, 'span.icon__premium')) {
                        return;
                    }
                    const title = processStr(await element.evaluate(node => node.innerText));
                    const article = await goToArticlePageAndParse(browser, articleHref);
                    return {
                        title: await asyncTranslate(title, LANG),
                        article,
                        publishTime: article.publishTime,
                    }
                }
            }));
            listNews = listNews.filter(i => i !== undefined);
            if (listNews) {
                const newNews = new NewsObject;
                newNews.ranking = idx;
                newNews.isLive = false;
                newNews.newsType = NewsTypes.CardWithList;
                newNews.relatedNewsList = listNews;
                newNews.publishTime = new Date(Math.max.apply(null, listNews.map(i => i.publishTime)));
                newNews.articleHref = listNews.map(i => i.articleHref).join(' ');
                return [news].concat(liveNewsList).concat([newNews]);
            } else {
                return [news].concat(liveNewsList)
            }
        } else {
            news.relatedNewsList = (await Promise.all(relatedElementList.map(async element => {
                if ((await element.$$('[class*="flag-live-cartridge"]')).length === 0) {
                    const title = processStr(await element.evaluate(node => node.innerText));
                    if (await ifSelectorExists(element, 'span.icon__premium')){
                        return;
                    }
                    return {
                        title: await asyncTranslate(title, LANG),
                        article: await goToArticlePageAndParse(browser, await element.evaluate(node => node.getAttribute('href'))),
                    }
                }
            }))).filter(i => i !== undefined);
            if (news.relatedNewsList.length === 0) {
                news.newsType = NewsTypes.CardWithImage;
            } else {
                news.newsType = NewsTypes.CardWithImageAndSubtitle;
            }
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if ((await element.$$('[class*="flag-live-cartridge"]')).length > 0) {
                    const articleHref = await element.evaluate(node => node.getAttribute('href'));
                    const title = processStr(await element.evaluate(node => node.innerText));
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref)
                    return {
                        title: await asyncTranslate(title, LANG),
                        ranking: idx,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        isLive: true,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i => i !== undefined);
            return [news].concat(liveNewsList);
        }
    }
    logger.info("parsed news " + news.articleHref, {platform: "LeMonde"});
    return news;
}
if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("13 0,2,4,6,8,10,12,14,16,18,20,22 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r.stack);
                process.exit(1);
            }
        );
}





