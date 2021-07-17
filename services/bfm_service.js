require('./mongodb_connection');
const News = require('../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.BFMURL;
const logger = require('../config/logger');
const moment = require('moment');
moment.locale('en');

let browser;

crawl = async () => {
    logger.info('BFM new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('main', {timeout: 0})
    logger.info('loaded')
    const elementList = (await page.$$('article[class*="une_item"], article[class*="duo_liste"]'))

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsing all news finish.')
    await News.bulkUpsertNews(allNewsResult.map(element => {
        return {
            platform: "bfm",
            ...element,
        }
    }));
    logger.info('BFM inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    let news = {
        ranking: idx,
    }
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.startsWith('/')) news.articleHref = URL + news.articleHref;
    if ((await element.$$('img[srcset], img[data-srcset]')).length > 0) {
        news.imageHref = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(/[\s,]+/)[0];
    }
    if ((await element.$$('.title_une_item')).length > 0){
        news.title = await element.$eval('.title_une_item', node=>node.innerText);
    }else{
        news.title = await element.$eval('.content_item_title', node => node.innerText);
    }
    news.isLive = (await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_live');
    news.isVideo = (await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_video');
    if (news.isLive) news.title = news.title.split('EN DIRECT - ')[1];

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
    await pageContent.waitForSelector('article[class*="content_article"]', {timeout: 0});

    article.title = await pageContent.$eval('#contain_title', node => node.innerText);
    article.summary = await pageContent.$eval('article .content_body_wrapper .chapo', node => node.innerText);

    const timeText = await pageContent.$eval('#signatures_date time', node => node.innerText);
    const date = new Date(moment(timeText.split(' à ')[0], 'DD/MM/YYYY', 'fr'));
    date.setHours(Number(timeText.split(' à ')[1].split(':')[0]));
    date.setMinutes(Number(timeText.split(' à ')[1].split(':')[1]));
    article.publishTime = date

    article.bodyBlockList = await pageContent.$$eval(
        'article .content_body_wrapper p,' +
        'article .content_body_wrapper blockquote,' +
        'article .content_body_wrapper .subheading',
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
    const liveElementList = await pageLive.$$('div.content_live_block[id^="article_"]');
    return await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('.live_block_title', node => node.innerText);
        const timeText = await element.$eval('.content_live_datetime time', node=>node.innerText)
        let date = new Date();
        date.setHours(Number(timeText.split(':')[0]));
        date.setMinutes(Number(timeText.split(':')[1]));
        return {
            liveTitle,
            liveTime:date,
            liveContent: {
                bodyBlockList: await element.$$eval(
                    '.content_post p, .content_post blockquote',
                        nodes=>nodes.map(n => n.outerHTML)
                )
            }
        }
    }));
}

schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





