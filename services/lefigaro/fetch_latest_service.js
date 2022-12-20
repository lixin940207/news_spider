require('../mongodb_connection');
const puppeteer = require('puppeteer');
const logger = require('../../config/logger');
const URL = require('../../config/config').ORIGINAL_URLS.LeFigaroURL;
const NewsTypes = require("../../models/news_type_enum");
const News = require('../../models/news')
const schedule = require("node-schedule");
const {processStr, getImageHref, ifSelectorExists, determineCategory} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {NewsObject} = require("../utils/objects");
const {parseLiveNews, parseArticle} = require("./common");
const {asyncKeywordExtractor} = require("../nlp_utils/keyword_extractor");
const LANG = require("../../config/config").LANGUAGE.LeFigaro;

let browser;

const crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeFigaro a new crawling start.' + current_ts);
    browser = await puppeteer.launch({
        timeout: 0,
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 0});
    logger.info('LeFigaro got to the page.');
    await page.waitForSelector('section.fig-main', {timeout: 0})
    logger.info('LeFigaro loaded');
    const elementList = await page.$$('section.fig-main section[class*="fig-ensemble"],' +
        'section.fig-main article[class*="fig-profile"]')

    const allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }
    logger.info('LeFigaro parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.flat().map(element => {
        element.platform = 'LeFigaro';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('LeFigaro-inserted into db.')
    await page.close();
    await browser.close();
}


const parseNews = async (element, idx) => {
    let elementClassName = await element.evaluate(node => node.getAttribute('class'))
    if (elementClassName.includes('fig-ensemble')) {
        if ((await element.$$('article[class*="fig-ensemble__first-article"] .fig-live-mark')).length > 0) {
            const news = await parseEnsembleLiveNews(element, idx);
            const otherNewsElement = await element.$$('ul li');
            const otherNews = await Promise.all(otherNewsElement.map(async node => {
                if ((await node.$$('.fig-live-mark')).length > 0) {
                    let articleHref = await node.$eval('a', node => node.getAttribute('href'));
                    const oriTitle = await node.$eval('a', node => node.innerText);
                    const title = await asyncTranslate(oriTitle, LANG);
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref);
                    return {
                        ranking: idx,
                        title,
                        categories: determineCategory(oriTitle),
                        keywords: await asyncKeywordExtractor(title),
                        articleHref,
                        isLive: true,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }));
            return [news].concat(otherNews.filter(i => i !== undefined))
        } else {
            if ((await element.$$('ul li .fig-live-mark')).length > 0) {
                const news = await parseEnsembleNews(element, idx, false);
                const subElementList = await element.$$('ul li');
                let relatedNewsListTemp = await Promise.all(subElementList.map(async node => {
                    if ((await node.$$('.fig-live-mark')).length === 0) {
                        const articleHref = await node.$eval('a', node => node.getAttribute('href'));
                        const title = processStr(await node.$eval('a', node => node.innerText));
                        return {
                            title: await asyncTranslate(title, LANG),
                            article: await parseArticle(browser, articleHref),
                        }
                    }
                }))
                relatedNewsListTemp = relatedNewsListTemp.filter(i => i !== undefined)
                if (relatedNewsListTemp === []) {
                    news.newsType = NewsTypes.CardWithImage;
                } else {
                    news.newsType = NewsTypes.CardWithImageAndSubtitle;
                    news.relatedNewsList = relatedNewsListTemp;
                }
                let liveElementListTemp = await Promise.all(subElementList.map(async node => {
                    if ((await node.$$('.fig-live-mark')).length > 0) {
                        const articleHref = await node.$eval('a', node => node.getAttribute('href'));
                        const oriTitle = processStr(await node.$eval('a', node => node.innerText));
                        const title = await asyncTranslate(oriTitle, LANG);
                        const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref);
                        return {
                            ranking: idx,
                            title,
                            categories: determineCategory(oriTitle),
                            keywords: await asyncKeywordExtractor(title),
                            articleHref,
                            isLive: true,
                            newsType: NewsTypes.CardWithLive,
                            liveNewsList,
                            publishTime: latestTime,
                        }
                    }
                }));
                liveElementListTemp = liveElementListTemp.filter(i => i !== undefined);
                return [news].concat(liveElementListTemp)
            } else {
                return await parseEnsembleNews(element, idx, true);
            }
        }
    } else if (elementClassName.includes('fig-profile--live')) {
        return await parseProfileOrLiveNews(element, idx, true);
    } else if (elementClassName.includes('fig-profile--np')) {
        return await parseProfileOrLiveNews(element, idx, false);
    } else {
        return await parseProfileOrLiveNews(element, idx, false);
    }
}

const parseEnsembleNews = async (element, idx, hasRelated) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.newsType = NewsTypes.CardWithTitleWide;
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'));
    news.isLive = news.articleHref.includes('/live/');
    const oriTitle = await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText);
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    if (await ifSelectorExists(element, 'p[class*="fig-ensemble__chapo"]')) {
        const oriSummary = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
        news.summary = await asyncTranslate(oriSummary, LANG);
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    news.categories = determineCategory(oriTitle);
    let hasImage = false;
    if ((await element.$$('img')).length > 0) {
        const imageDataSrc = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
        news.imageHref = imageDataSrc[imageDataSrc.length - 2];
        hasImage = true;
    }
    news.imageHref = await getImageHref(element);
    if (news.imageHref !== undefined) {
        news.newsType = NewsTypes.CardWithImage;
        hasImage = true;
    }
    if (news.isLive) {
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
    } else {
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
    }
    if (hasRelated) {
        const relatedElementList = await element.$$('ul li');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async node => {
            const title = processStr(await node.$eval('a', n => n.innerText));
            return {
                title: await asyncTranslate(title, LANG),
                article: await parseArticle(browser, await node.$eval('a', n => n.getAttribute('href')))
            }
        }));
        news.newsType = hasImage ? NewsTypes.CardWithImageAndSubtitle : NewsTypes.CardWithList;
    }
    if (news.isLive && hasImage) {
        news.newsType = NewsTypes.CardWithImageAndLive
    } else if (news.isLive) {
        news.newsType = NewsTypes.CardWithLive;
    }
    logger.info("parsed news " + news.articleHref, {platform: "Lefigaro"});
    return news;
}

const parseProfileOrLiveNews = async (element, idx, isLive) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.isLive = isLive;
    news.newsType = isLive ? NewsTypes.CardWithLive : NewsTypes.CardWithTitleIntro

    if ((await element.$$('[class*="fig-profile__headline"]')).length === 0) {
        console.log(await element.evaluate(node => node.outerHTML))
    }
    const oriTitle = processStr(await element.$eval('[class*="fig-profile__headline"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = determineCategory(oriTitle);
    news.articleHref = await element.$eval('a.fig-profile__link', node => node.getAttribute('href'));
    // objects.category = objects.articleHref.split('/')[3];
    news.imageHref = await getImageHref(element);
    if (news.imageHref !== undefined) news.newsType = isLive ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithImage
    const oriSummary = processStr(await element.$eval('[class*="fig-profile__chapo"]', node => node.innerText));
    news.summary = await asyncTranslate(oriSummary, LANG);
    if (isLive) {
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
    } else {
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
    }
    logger.info("parsed news " + news.articleHref, {platform: "Lefigaro"});
    return news;
}

const parseEnsembleLiveNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.newsType = NewsTypes.CardWithImageAndLive;
    const oriTitle = processStr(await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.keywords = await asyncKeywordExtractor(news.title);
    news.categories = determineCategory(oriTitle);
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'))
    // objects.category = objects.articleHref.split('/')[3];
    news.imageHref = await getImageHref(element);
    const oriSummary = processStr(await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText));
    news.summary = await asyncTranslate(oriSummary, LANG);
    news.isLive = true
    const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
    news.liveNewsList = liveNewsList;
    news.publishTime = latestTime;

    logger.info("parsed news " + news.articleHref, {platform: "Lefigaro"});

    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("58 1,3,5,7,9,11,13,15,17,19,21,23 * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
