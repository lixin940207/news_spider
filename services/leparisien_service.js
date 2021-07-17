require('./mongodb_connection');
const News = require('../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.LeParisienURL;
const logger = require('../config/logger');
const moment = require('moment');
moment.locale('en');

let browser;

crawl = async () => {
    logger.info('LeParisien new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('article', {timeout: 0})
    logger.info('loaded')
    const elementList = (await page.$$('article section#left [class*="story-preview"]'))

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsing all news finish.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        return {
            platform: "leparisien",
            ...element,
        }
    }));
    logger.info('LeParisien inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    let news = {
        ranking: idx,
    }
    news.articleHref = 'https:' + await element.$eval('a', node => node.getAttribute('href'));
    // console.log(news.articleHref)
    if ((await element.$$('img[src]')).length > 0) {
        news.imageHref = URL + await element.$eval('img[src]', node => node.getAttribute('src'));
    }
    news.title = await element.$eval('.story-headline', node => node.innerText);
    news.isLive = news.title.startsWith('DIRECT.');
    if (news.isLive) news.title = news.title.slice(7,);

    if ((await element.$$('.story-subheadline')).length > 0) {
        news.summary = await element.$eval('.story-subheadline', node => node.innerText);
    }
    news.newsType = NewsTypes.CardWithImage;
    if (news.isLive) {
        news.liveNewsList = await parseLiveNews(news.articleHref);
        news.newsType = NewsTypes.CardWithImageAndLive;
    } else {
        news.article = await goToArticlePageAndParse(news.articleHref);
        news.publishTime = news.article.publishTime
    }
    return news;
}


goToArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});

    article.title = await pageContent.$eval('article header [class*="title_xl"]', node => node.innerText);
    article.summary = await pageContent.$eval('article header [class*="subheadline"]', node => node.innerText);

    const timeText = await pageContent.$eval('article section#left [class*="timestamp"]', node => node.innerText);
    let date = '';
    if (timeText.includes('modifié')){
        const modifyTime = timeText.split(' le ')[1];
        date = new Date(moment(modifyTime.split(' à ')[0], 'DD MMMM YYYY', 'fr'));
        date.setHours(Number(modifyTime.split(' à ')[1].split('h')[0]));
        date.setMinutes(Number(modifyTime.split(' à ')[1].split('h')[1]));
    } else {
        const publishTime = timeText.split('Le ')[1];
        date = new Date(moment(publishTime.split(' à ')[0], 'DD MMMM YYYY', 'fr'));
        date.setHours(Number(publishTime.split(' à ')[1].split('h')[0]));
        date.setMinutes(Number(publishTime.split(' à ')[1].split('h')[1]));
    }

    article.publishTime = date

    article.bodyBlockList = await pageContent.$$eval(
        'article section#left [class*="article-section"] .content p' +
        'article section#left [class*="article-section"] .content h2',
        nodes => nodes.map(n => n.outerHTML));
    return article;
}

parseLiveNews = async (url) => {
    // logger.info('parsing live news:' + url)
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    try {
        await pageLive.waitForSelector('article', {timeout: 0});
    } catch (e) {
        logger.error(url + 'has problem!')
    }
    // console.log('parsed'+url)
    const liveElementList = await pageLive.$$('article div[class*="article-section"] section.content p[class*="paragraph"]');
    const liveNewsListTemp =  await Promise.all(liveElementList.map(async element => {
        let liveTitle = '';
        let summary = '';
        if ((await element.$$('b')).length > 0){
            liveTitle = (await element.$$eval('b', nodes => nodes.map(n=>n.innerText))).join('');
            summary = (await element.evaluate(node=>node.innerText)).split(liveTitle)[1];
        }else{
            summary = await element.evaluate(node=>node.innerText);
        }
        return {
            liveTitle,
            liveContent: {
                summary
            }
        }
    }));
    let liveNewsList = []
    for (let i = 0; i < liveNewsListTemp.length; i++) {
        if(liveNewsListTemp[i].liveTitle === ''){
            liveNewsList[liveNewsList.length-1].liveContent.summary += liveNewsListTemp[i].liveContent.summary;
        }else{
            liveNewsList.push(liveNewsListTemp[i])
        }
    }
    return liveNewsList;
}

schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





