const puppeteer = require('puppeteer');
const schedule = require('node-schedule');

const URL = require('../config/config').ORIGINAL_URLS.BBCURL;
const CRAWL_TIME_INTERVAL = require('../config/config');
const NewsTypes = require("../models/news_type_enum");
const BBCNews = require('../models/bbc');

let browser;

crawl = async () => {
    console.log('BBC new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    console.log('got to page.')
    await page.waitForSelector('div#news-top-stories-container', {timeout: 0})

    const news_list = await page.$$('div#news-top-stories-container div[data-entityid*="container-top-stories"]')
    console.log('got dom.')

    let promises = [];
    for (let i = 0; i < news_list.length; i++) {
        let p = parseNews(news_list[i]);
        promises.push(p);
    }
    const allNewsResult = await Promise.all(promises);
    console.log('parsed all news.')
    await BBCNews.bulkUpsertNews(allNewsResult);
    console.log('inserted into db.')
    await page.close();
    await browser.close();
}

getNewsType = async (element) => {
    return await element.evaluate(node => {
        const elementClass = node.getAttribute('class').toString();
        let newsType;
        if (elementClass.includes('gs-o-primary-promo')) {
            newsType = 1;
        } else if (elementClass.includes('gs-u-pb-alt@m')) {
            newsType = 3;
        } else {
            newsType = 2;
        }
        return newsType;
    });
}

parseNews = async (element) => {
    const dataEntityId = await element.evaluate(node => node.getAttribute('data-entityid'));
    const ranking = Number(dataEntityId.split('#')[1]);

    const newsType = await getNewsType(element);
    let news;
    if (newsType === 1) {
        news = {
            ...(await getCommonPart(element)),
            ranking,
            newsType: NewsTypes.CardWithImageAndSubtitle,
            relatedNewsList: await element.$$eval('li[class*="nw-c-related-story"] a', nodes => {
                nodes.map(async n => {
                    return {
                        relatedTitle: node.innerText,
                        relatedHref: await node.getAttribute('href')
                    }
                })
            })
        }
    } else if (newsType === 2) {
        news = {
            ranking,
            newsType: NewsTypes.CardWithImage,
            ...(await getCommonPart(element))
        }
    } else {
        news = {
            ranking,
            newsType: NewsTypes.CardWithTitle,
            ...(await getCommonPart(element))
        }
    }
    return news;
}


getCommonPart = async (element) => {
    let news = {}
    const content_element = await element.$('div.gs-c-promo-body');
    const image_element = await element.$('div.gs-c-promo-image');

    news.imageHref = await image_element.$eval('img', node => node.getAttribute('src'));
    [news.title, news.articleHref] = await content_element.$eval('a[class*="gs-c-promo-heading"]', node => {
        return [node.innerText, 'https://www.bbc.com' + node.getAttribute('href')]
    });
    news.summary = await content_element.$eval('p[class*="gs-c-promo-summary"]', node => node.innerText);
    if ((await content_element.$$('time')).length > 0) {
        news.originCreatedAt = await content_element.$eval('time', node => node.getAttribute('datetime'));
    }
    news.region = await content_element.$eval('a[class*="gs-c-section-link"]', node => node.innerText);
    news.isVideo = (await content_element.$$('span[class*="gs-c-media-indicator"]')).length > 0;
    news.isLive = (await content_element.$$('[class*="gs-c-live-pulse"]')).length > 0;
    if (!news.isVideo && !news.isLive) {
        news.content = await goToArticlePageAndParse(news.articleHref);
    } else if (news.isLive){
        news.liveNewsList = await parseLiveNews(news.articleHref);
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
        return {
            liveTitle: await element.$eval('header[class*="lx-stream-post__header"]', node => node.innerText),
            liveHref: url,
            liveTime: await element.$eval('time span.qa-post-auto-meta', node => node.innerText),
            liveContent: {
                title: liveTitle,
                summary: await element.$$eval('div.lx-stream-post-body img, div.lx-stream-post-body p', nodes => nodes.map(
                    n => n.outerHTML
                ))
            }
        }
    }));
}

goToArticlePageAndParse = async (url) => {
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    const blockElementList = await pageContent.$$('article > div[data-component="image-block"],' +
        'article > div[data-component="text-block"],' +
        'article > div[data-component="unordered-list-block"],' +
        'article > div[data-component="media-block"],' +
        'article > div[data-component="crosshead-block"]');
    let richContent = '';
    for (let i = 0; i < blockElementList.length; i++) {
        const dataComponent = await blockElementList[i].evaluate(node => node.getAttribute("data-component"))
        if (dataComponent === 'text-block') {
            richContent += await blockElementList[i].$eval('p', node => node.outerHTML);
        } else if (dataComponent === 'unordered-list-block') {
            richContent += await blockElementList[i].$eval('ul', node => node.outerHTML);
        } else if (dataComponent === 'image-block' && (await blockElementList[i].$$('img')).length > 0) {
            richContent += await blockElementList[i].$eval('img', node => node.outerHTML);
        } else if (dataComponent === 'media-block' && (await blockElementList[i].$$('img')).length > 0) {
            richContent += await blockElementList[i].$eval('img', node => node.outerHTML);
        } else if (dataComponent === 'crosshead-block' && (await blockElementList[i].$$('h2')).length > 0) {
            richContent += await blockElementList[i].$eval('h2', node => node.outerHTML);
        }
    }
    await pageContent.close();
    return richContent;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);




