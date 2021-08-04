const puppeteer = require('puppeteer');
const logger = require('../../config/logger');
require('../mongodb_connection');
const URL = require('../../config/config').ORIGINAL_URLS.LeFigaroURL;
const NewsTypes = require("../../models/news_type_enum");
const News = require('../../models/news')
const schedule = require("node-schedule");
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {parseLiveNews, parseArticle} = require("./common");
const {ifSelectorExists} = require("../utils/util");
const {determineCategory} = require("../utils/util");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeFigaro a new crawling start.'+ current_ts);
    browser = await puppeteer.launch({timeout:0});
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 0});
    logger.info('LeFigaro got to the page.');
    await page.waitForSelector('section.fig-main', {timeout: 0})
    logger.info('LeFigaro loaded');
    const elementList = await page.$$('section.fig-main section[class*="fig-ensemble"],' +
        'section.fig-main article[class*="fig-profile"]')

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('LeFigaro parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.flat().map(element=>{
        element.platform = 'LeFigaro';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('LeFigaro-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx) => {
    let elementClassName = await element.evaluate(node => node.getAttribute('class'))
    if (elementClassName.includes('fig-ensemble')) {
        if ((await element.$$('article[class*="fig-ensemble__first-article"] .fig-live-mark')).length > 0) {
            const news = await parseEnsembleLiveNews(element, idx);
            const otherNewsElement = await element.$$('ul li');
            const otherNews = await Promise.all(otherNewsElement.map(async node => {
                if ((await node.$$('.fig-live-mark')).length > 0) {
                    let articleHref = await node.$eval('a', node => node.getAttribute('href'));
                    let title = await node.$eval('a', node => node.innerText);
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref);
                    return {
                        ranking:idx,
                        title: {
                            ori: title,
                            cn: await pushToQueueAndWaitForTranslateRes(title),
                        },
                        categories: determineCategory(title),
                        articleHref,
                        // category: articleHref.split('/')[3],
                        isLive: true,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }));
            return [news].concat(otherNews.filter(i=>i!==undefined))
        } else {
            if ((await element.$$('ul li .fig-live-mark')).length > 0) {
                const news = await parseEnsembleNews(element, idx, false);
                const subElementList = await element.$$('ul li');
                let relatedNewsListTemp = await Promise.all(subElementList.map(async node => {
                    if ((await node.$$('.fig-live-mark')).length === 0) {
                        const articleHref = await node.$eval('a', node => node.getAttribute('href'));
                        const title = await node.$eval('a', node => node.innerText);
                        return {
                            title: {
                                ori:title,
                                cn: await pushToQueueAndWaitForTranslateRes(title),
                            },
                            article: await parseArticle(browser, articleHref),
                        }
                    }
                }))
                relatedNewsListTemp = relatedNewsListTemp.filter(i=>i!==undefined)
                if (relatedNewsListTemp === []){
                    news.newsType = NewsTypes.CardWithImage;
                }else{
                    news.newsType = NewsTypes.CardWithImageAndSubtitle;
                    news.relatedNewsList = relatedNewsListTemp;
                }
                let liveElementListTemp = await Promise.all(subElementList.map(async node => {
                    if ((await node.$$('.fig-live-mark')).length > 0) {
                        let articleHref = await node.$eval('a', node => node.getAttribute('href'));
                        let title = await node.$eval('a', node => node.innerText);
                        const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref);
                        return {
                            ranking:idx,
                            title: {
                                ori: title,
                                cn: await pushToQueueAndWaitForTranslateRes(title),
                            },
                            categories: determineCategory(title),
                            articleHref,
                            // category: articleHref.split('/')[3],
                            isLive: true,
                            newsType: NewsTypes.CardWithLive,
                            liveNewsList,
                            publishTime: latestTime,
                        }
                    }
                }));
                liveElementListTemp = liveElementListTemp.filter(i=>i!==undefined);
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

parseEnsembleNews = async (element, idx, hasRelated) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.newsType = NewsTypes.CardWithTitleWide;
    news.isLive = (await element.$$('fig-live-mark')).length > 0
    news.title.ori = await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText);
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    if (await ifSelectorExists(element, 'p[class*="fig-ensemble__chapo"]')){
        news.summary.ori = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
        news.summary.cn = await pushToQueueAndWaitForTranslateRes(news.summary.ori);
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    news.categories = determineCategory(news.title.ori);
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'));
    let hasImage = false;
    if((await element.$$('img')).length > 0){
        const imageDataSrc = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
        news.imageHref = imageDataSrc[imageDataSrc.length - 2];
        hasImage = true;
    }
    news.imageHref = await getImageHref(element);
    if(news.imageHref !== undefined){
        news.newsType = NewsTypes.CardWithImage;
        hasImage = true;
    }

    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    if (hasRelated) {
        const relatedElementList = await element.$$('ul li');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async node => {
            return {
                title: {ori: await node.$eval('a', n => n.innerText)},
                article: await parseArticle(browser, await node.$eval('a', n => n.getAttribute('href')))
            }
        }));
        news.newsType = hasImage?NewsTypes.CardWithImageAndSubtitle:NewsTypes.CardWithList;
    }
    return news;
}

parseProfileOrLiveNews = async (element, idx, isLive) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.isLive = isLive;
    news.newsType = isLive ? NewsTypes.CardWithLive : NewsTypes.CardWithTitleIntro

    if ((await element.$$('[class*="fig-profile__headline"]')).length === 0){
        console.log(await element.evaluate(node=>node.outerHTML))
    }
    news.title.ori = processStr(await element.$eval('[class*="fig-profile__headline"]', node => node.innerText));
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    news.categories = determineCategory(news.title.ori);
    news.articleHref = await element.$eval('a.fig-profile__link', node => node.getAttribute('href'));
    // objects.category = objects.articleHref.split('/')[3];
    news.imageHref = await getImageHref(element);
    if(news.imageHref !== undefined)    news.newsType = isLive? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithImage
    news.summary.ori = processStr(await element.$eval('[class*="fig-profile__chapo"]', node => node.innerText));
    news.summary.cn = await pushToQueueAndWaitForTranslateRes(news.summary.ori);
    if (isLive) {
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
    } else {
        news.article = await parseArticle(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
    }
    return news;
}

parseEnsembleLiveNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.newsType = NewsTypes.CardWithImageAndLive;
    news.title.ori = processStr(await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText));
    news.title.cn = await pushToQueueAndWaitForTranslateRes(news.title.ori);
    news.categories = determineCategory(news.title.ori);
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'))
    // objects.category = objects.articleHref.split('/')[3];
    news.imageHref = await getImageHref(element);
    news.summary.ori = processStr(await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText));
    news.summary.cn = await pushToQueueAndWaitForTranslateRes(news.summary.ori);
    news.isLive = true
    const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
    news.liveNewsList = liveNewsList;
    news.publishTime = latestTime;
    return news;
}

// schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
crawl().then(r => {})


