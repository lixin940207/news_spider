require('./mongodb_connection');
const News = require('../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.France24URL;
const logger = require('../config/logger');

let browser;

crawl = async () => {
    logger.info('France24 new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('main div[class*="t-content"]', {timeout: 0})
    logger.info('loaded')
    const containerList = (await page.$$('main div[class*="t-content"] section.t-content__section-pb')).slice(0, 3);
    //div[class*="m-item-list-article"]
    const elementList = (await Promise.all(containerList.map(async node=> {
        return await node.$$('div[class*="m-item-list-article"]')
    }))).flat();

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsing all news finish.')
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        return {
            platform:"france24",
            ...element,
        }
    }));
    logger.info('France24 inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    let news = {
        ranking: idx,
    }
    news.articleHref = 'https://www.france24.com' + await element.$eval('a', node => node.getAttribute('href'));
    news.title = await element.$eval('[class*="article__title"]', node => node.innerText);
    if ((await element.$$('img[src]')).length > 0) {
        news.imageHref = (await element.$eval('img[src] + noscript', node => node.innerText)).split('"')[1];
        console.log(news.imageHref);
    }
    news.newsType = NewsTypes.CardWithImage
    news.article = await goToArticlePageAndParse(news.articleHref);
    news.publishTime = news.article.publishTime
    return news;
}


goToArticlePageAndParse = async (url) => {
        let article = {};
        const pageContent = await browser.newPage();
        await pageContent.goto(url, {
            waitUntil: 'load', timeout: 0
        });
        await pageContent.bringToFront();
        await pageContent.waitForSelector('main article', {timeout: 0});

        article.title = await pageContent.$eval('article [class*="t-content__title"]', node => node.innerText);
        article.summary = await pageContent.$eval('article .t-content__chapo', node => node.innerText);

        article.publishTime = await pageContent.$eval('article time[datetime]', node => node.getAttribute('datetime'));

        article.bodyBlockList = await pageContent.$$eval(
            'article div[class*="t-content__body"] p',
            nodes => nodes.map(n => n.outerHTML));
        return article;
}



schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





