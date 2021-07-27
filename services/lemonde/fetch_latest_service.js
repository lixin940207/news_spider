require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.LeMondeURL;
const logger = require('../../config/logger');
const {translateText} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {determineCategory} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");
const {goToArticlePageAndParse, parseLiveNews} = require('./common');

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('LeMonde new crawling start.'+ current_ts);
    browser = await puppeteer.launch();
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
        // return {
        //     platform:"LeMonde",
        //     displayOrder: element.ranking * 0.01 - current_ts, //;  getDisplayOrder(element.ranking, current_ts),
        //     ...element
        // }
        element.platform = 'LeMonde';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    })
    logger.info('LeMonde parsing all objects finish.')
    console.log(await News.bulkUpsertNews(allNewsResult));
    logger.info('LeMonde inserting into db finish.')
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    // objects.category = objects.articleHref.split('/')[3];
    news.title.ori = await element.$eval('[class*="article__title"]', node => node.innerText);
    news.categories = determineCategory(news.title);
    news.newsType = NewsTypes.CardWithTitleWide;
    if (await ifSelectorExists(element,'.article__desc')) {
        news.summary.ori = await element.$eval('.article__desc', node => node.innerText);
        news.summary.cn = await translateText(news.summary.ori);
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    let hasImage = false;
    news.imageHref = await getImageHref(element, 'img', 1);
    if (news.imageHref!==undefined){
        hasImage = true;
        news.newsType = NewsTypes.CardWithImage;
    }
    news.isLive = (await element.$$('[class*="flag-live-cartridge"]')).length > 0;
    if (news.isLive) {
        news.title.ori = news.title.ori.split('LIVE')[1];
        news.liveNewsList = await parseLiveNews(browser, news.articleHref);
        news.newsType = hasImage ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
    } else {
        news.article = await goToArticlePageAndParse(browser, news.articleHref);
        news.publishTime = news.article.publishTime
    }
    news.title.cn = await translateText(news.title.ori);
    if (await ifSelectorExists(element,'ul[class*="article__related"]')) {
        const relatedElementList = await element.$$('ul[class*="article__related"] li a');
        if(news.isLive){
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length > 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = await element.evaluate(node=>node.innerText);
                    return {
                        title: {
                            ori: title,
                            cn: await translateText(title),
                        },
                        ranking:idx,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList: await parseLiveNews(browser, articleHref),
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i=>i!==undefined);
            let listNews = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length === 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = await element.evaluate(node=>node.innerText);
                    return {
                        title: {
                            ori: title,
                            cn: await translateText(title),
                        },
                        article: await goToArticlePageAndParse(browser,articleHref),
                    }
                }
            }));
            listNews = listNews.filter(i=>i!==undefined);
            if (listNews){
                const newNews = Object.create(NewsObject);
                newNews.ranking = idx;
                newNews.newsType =  NewsTypes.CardWithList;
                newNews.relatedNewsList = listNews;
                news.articleHref = listNews.map(i=>i.articleHref).join(' ');
                return [news].concat(liveNewsList).concat([newNews]);
            }else{
                return [news].concat(liveNewsList)
            }
        }else{
            news.relatedNewsList = (await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length === 0){
                    const title = await element.evaluate(node=>node.innerText);
                    return {
                        title: {
                            ori: title,
                            cn: await translateText(title),
                        },
                        article: await goToArticlePageAndParse(browser, await element.evaluate(node=>node.getAttribute('href'))),
                    }
                }
            }))).filter(i=>i!==undefined);
            news.newsType = NewsTypes.CardWithImageAndSubtitle;
            let liveNewsList = await Promise.all(relatedElementList.map(async element => {
                if((await element.$$('[class*="flag-live-cartridge"]')).length > 0){
                    const articleHref = await element.evaluate(node=>node.getAttribute('href'));
                    const title = await element.evaluate(node=>node.innerText);
                    return {
                        title: {
                            ori: title,
                            cn: await translateText(title),
                        },
                        ranking: idx,
                        articleHref,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList: await parseLiveNews(browser, articleHref),
                    }
                }
            }))
            liveNewsList = liveNewsList.filter(i=>i!==undefined);
            return [news].concat(liveNewsList);
        }
    }

    return news;
}



schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





