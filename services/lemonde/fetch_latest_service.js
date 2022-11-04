require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.LeMondeURL;
const logger = require('../../config/logger');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {determineCategory} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");
const {goToArticlePageAndParse, parseLiveNews} = require('./common');

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeMonde new crawling start.'+ current_ts);
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

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    let allNewsResult = await Promise.all(promises);
    allNewsResult = allNewsResult.flat();
    allNewsResult = allNewsResult.map(element=>{
        element.platform = 'LeMonde';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    })
    logger.info('LeMonde parsing all objects finish.')
    await News.bulkUpsertNews(allNewsResult);
    logger.info('LeMonde inserting into db finish.')
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    // objects.category = objects.articleHref.split('/')[3];
    news.title.ori = processStr(await element.$eval('.article__title', node => node.innerText));
    news.categories = determineCategory(news.title.ori);
    news.newsType = NewsTypes.CardWithTitleWide;
    if (await ifSelectorExists(element,'.article__desc')) {
        news.summary.ori = processStr(await element.$eval('.article__desc', node => node.innerText));
        news.summary.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.summary.ori):"";
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    let hasImage = false;
    news.imageHref = await getImageHref(element, 'picture.article__media img', 1);
    if (news.imageHref!==undefined){
        hasImage = true;
        news.newsType = NewsTypes.CardWithImage;
    }
    news.isLive = (await element.$$('[class*="flag-live-cartridge"]')).length > 0;
    if (news.isLive) {
        news.title.ori = processStr(await element.$eval('.article__title', node => node.innerText));
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
        news.newsType = hasImage ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
    } else {
        news.article = await goToArticlePageAndParse(browser, news.articleHref);
        news.publishTime = news.article.publishTime;
    }
    news.title.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";
    if (await ifSelectorExists(element,'ul[class*="article__related"]')) {
        const relatedElementList = await element.$$('ul[class*="article__related"] li a');
        if(news.isLive){
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length > 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = processStr(await element.evaluate(node=>node.innerText));
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref)
                    return {
                        title: {
                            ori: title,
                            cn: ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(title):"",
                        },
                        ranking:idx,
                        isLive: true,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i=>i!==undefined);
            let listNews = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length === 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = processStr(await element.evaluate(node=>node.innerText));
                    const article = await goToArticlePageAndParse(browser,articleHref);
                    return {
                        title: {
                            ori: title,
                            cn: ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(title):"",
                        },
                        article,
                        publishTime: article.publishTime,
                    }
                }
            }));
            listNews = listNews.filter(i=>i!==undefined);
            if (listNews){
                const newNews = new NewsObject;
                newNews.ranking = idx;
                newNews.isLive = false;
                newNews.newsType =  NewsTypes.CardWithList;
                newNews.relatedNewsList = listNews;
                newNews.publishTime = new Date(Math.max.apply(null,listNews.map(i=>i.publishTime)));
                newNews.articleHref = listNews.map(i=>i.articleHref).join(' ');
                return [news].concat(liveNewsList).concat([newNews]);
            }else{
                return [news].concat(liveNewsList)
            }
        }else{
            news.relatedNewsList = (await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length === 0){
                    const title = processStr(await element.evaluate(node=>node.innerText));
                    return {
                        title: {
                            ori: title,
                            cn: ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(title):"",
                        },
                        article: await goToArticlePageAndParse(browser, await element.evaluate(node=>node.getAttribute('href'))),
                    }
                }
            }))).filter(i=>i!==undefined);
            news.newsType = NewsTypes.CardWithImageAndSubtitle;
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length > 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = processStr(await element.evaluate(node=>node.innerText));
                    const {liveNewsList, latestTime} = await parseLiveNews(browser, articleHref)
                    return {
                        title: {
                            ori: title,
                            cn: ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(title):"",
                        },
                        ranking: idx,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList,
                        publishTime: latestTime,
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i=>i!==undefined);
            return [news].concat(liveNewsList);
        }
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





