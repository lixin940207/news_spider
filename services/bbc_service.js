const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('./mongodb_connection');
const BBCNews = require('../models/bbc');
const News = require('../models/news');
const URL = require('../config/config').ORIGINAL_URLS.BBCURL;
const {CRAWL_TIME_INTERVAL} = require('../config/config');
const logger = require('../config/logger');
const NewsTypes = require("../models/news_type_enum");
const moment = require('moment');

let browser;

crawl = async () => {
    logger.info('BBC a new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'domcontentloaded',
        timeout: 0
    });
    logger.info('loaded.')
    await page.waitForSelector('div#news-top-stories-container', {timeout: 0})

    const news_list = await page.$$('div#news-top-stories-container div[class*="nw-c-top-stories-primary__story"],' +
        'div#news-top-stories-container div[class*="nw-c-top-stories__secondary-item"],' +
        'div#news-top-stories-container div[class*="nw-c-top-stories__tertiary-items"]')
    logger.info('got dom.')

    let promises = [];
    for (let i = 0; i < news_list.length; i++) {
        let p = parseNews(news_list[i], i+1);
        promises.push(p);
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsed all news.')
    // await BBCNews.bulkUpsertNews(allNewsResult);
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        return {
            platform:"bbc",
            ...element
        }
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}

getNewsType = async (element) => {
    return await element.evaluate(node => {
        const elementClass = node.getAttribute('class').toString();
        let newsType;
        if (elementClass.includes('nw-c-top-stories-primary__story')) {
            newsType = 1;
        } else if (elementClass.includes('nw-c-top-stories__tertiary-items')) {
            newsType = 3;
        } else {
            newsType = 2;
        }
        return newsType;
    });
}

goToArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    if ((await pageContent.$$('#main-heading')).length >0 ){
        article.title = await pageContent.$eval('#main-heading', node=>node.innerText);
    } else if ((await pageContent.$$('[class*="qa-story-headline"]')).length > 0)
    {
        article.title = await pageContent.$eval('h1', node=>node.innerText)
    } else{
        throw Error(url + " cannot find headline.")
    }
    article.articleHref = url;
    article.publishTime = await pageContent.$eval('time[datetime]', node=>node.getAttribute('datetime'));

    const blockElementList = await pageContent.$$('article > div[data-component="image-block"],' +
        'article > div[data-component="text-block"],' +
        'article > div[data-component="unordered-list-block"],' +
        'article > div[data-component="media-block"],' +
        'article > div[data-component="crosshead-block"]');
    let bodyBlockList = [];
    for (let i = 0; i < blockElementList.length; i++) {
        const dataComponent = await blockElementList[i].evaluate(node => node.getAttribute("data-component"))
        if (dataComponent === 'text-block') {
            bodyBlockList.push(await blockElementList[i].$eval('p', node => node.outerHTML));
        } else if (dataComponent === 'unordered-list-block') {
            bodyBlockList.push(await blockElementList[i].$eval('ul', node => node.outerHTML));
        } else if (dataComponent === 'image-block' && (await blockElementList[i].$$('img')).length > 0) {
            if ((await blockElementList[i].$$('img[alt*="line"]')).length > 0) break;
            bodyBlockList.push(await blockElementList[i].$eval('img', node => node.outerHTML));
        } else if (dataComponent === 'media-block' && (await blockElementList[i].$$('img')).length > 0) {
            bodyBlockList.push(await blockElementList[i].$eval('img', node => node.outerHTML));
        } else if (dataComponent === 'crosshead-block' && (await blockElementList[i].$$('h2')).length > 0) {
            bodyBlockList.push(await blockElementList[i].$eval('h2', node => node.outerHTML));
        }
    }
    article.bodyBlockList = bodyBlockList
    return article;
}

goToWeatherArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('div[class*="wr-cs-feature"]', {timeout: 0});

    article.title = await pageContent.$eval('h1[class*="wr-feature-header__title"]', node=>node.innerText);

    article.articleHref = url;
    const timeText = await pageContent.$eval('.wr-feature-header__duration-text', node=>node.innerText);
    const date = new Date(moment(timeText.split(' Last updated at ')[0], "DD MMMM YYYY"));
    date.setHours(Number(timeText.split(' Last updated at ')[1].split(':')[0]));
    date.setMinutes(Number(timeText.split(' Last updated at ')[1].split(':')[1]));
    article.publishTime = date;

    article.bodyBlockList = await pageContent.$$eval('div.wr-cs-feature__content p', nodes=>nodes.map(n=>n.outerHTML));
    return article;
}

parseNews = async (element, idx) => {
    const newsType = await getNewsType(element);
    let news;
    if (newsType === 1) {
        const relatedElementList = await element.$$('li[class*="nw-c-related-story"] a');
        const relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            const articleHref = await element.evaluate(node=>node.getAttribute('href'));
            let article;
            if (articleHref.startsWith('/weather')){
                article = await goToWeatherArticlePageAndParse("https://www.bbc.com" + articleHref);
            }else{
                article = await goToArticlePageAndParse("https://www.bbc.com" + articleHref);
            }
            return {
                title: await element.evaluate(node=>node.innerText),
                article
            }
        }))
        news = {
            ...(await getCommonPart(element)),
            ranking:idx,
            newsType: NewsTypes.CardWithImageAndSubtitle,
            relatedNewsList
        }
    } else if (newsType === 2) {
        news = {
            ranking:idx,
            newsType: NewsTypes.CardWithImage,
            ...(await getCommonPart(element))
        }
    } else {
        news = {
            ranking:idx,
            ...(await getCommonPart(element)),
            newsType: NewsTypes.CardWithTitleWide,
        }
    }
    return news;
}


getCommonPart = async (element) => {
    let news = {}
    const content_element = await element.$('div.gs-c-promo-body');
    const image_element = await element.$('div.gs-c-promo-image');
    if (image_element !== null){
        news.imageHref = (await image_element.$eval('img', node => {
            if (!(node.getAttribute('src').startsWith('http'))){
                return node.getAttribute('data-src');
            }
            return node.getAttribute('src');
        })).replace('{width}', '240');
    }
    news.title = await content_element.$eval('[class*="nw-o-link-split__text"]', node=>node.innerText)
    news.articleHref = await content_element.$eval('a', node => {
        return "https://www.bbc.com" + node.getAttribute('href')
    });
    if ((await content_element.$$('p[class*="gs-c-promo-summary"]')).length > 0)
    {
        news.summary = await content_element.$eval('p[class*="gs-c-promo-summary"]', node => node.innerText);
    }
    if ((await content_element.$$('time[datetime]')).length > 0) {
        news.publishTime = await content_element.$eval('time[datetime]', node => node.getAttribute('datetime'));
    }
    if((await content_element.$$('a[class*="gs-c-section-link"]')).length > 0)
    {
        news.region = await content_element.$eval('a[class*="gs-c-section-link"]', node => node.innerText);
    }
    news.isVideo = (await content_element.$$('span[class*="gs-c-media-indicator"]')).length > 0;
    news.isLive = (await content_element.$$('[class*="gs-c-live-pulse"]')).length > 0;
    if (!news.isVideo && !news.isLive) {
        if (news.articleHref.includes('/weather/')){
            news.article = await goToWeatherArticlePageAndParse(news.articleHref);
        }else{
            news.article = await goToArticlePageAndParse(news.articleHref);
        }
    } else if (news.isLive){
        news.liveNewsList = await parseLiveNews(news.articleHref);
        news.newsType = NewsTypes.CardWithImageAndLive
    }
    return news;
}


parseLiveNews = async (url)=>{
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageLive.waitForSelector('div#lx-stream', {timeout: 0});
    const liveElementList = await pageLive.$$('li[class*="lx-stream__post-container"] article');
    return await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('header[class*="lx-stream-post__header"]', node => node.innerText);
        const timeText = await element.$eval('time span.qa-post-auto-meta', node => node.innerText);
        let date = new Date();
        date.setHours(Number(timeText.split(':')[0]))
        date.setMinutes(Number(timeText.split(':')[1]))
        return {
            liveTitle,
            liveHref: url,
            liveTime: date,
            liveContent: {
                title: liveTitle,
                articleHref: url,
                publishTime: date,
                bodyBlockList: await element.$$eval(
                    'div.lx-stream-post-body img, ' +
                    'div.lx-stream-post-body p, ' +
                    'div.lx-stream-post-body ul',
                        nodes => nodes.map(
                        n => n.outerHTML
                    ))
                }
            }
        }
    ));
}



schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





