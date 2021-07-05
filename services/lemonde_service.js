const LeMondeNews = require('../models/lemonde');
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.LeMondeURL;

// class LeMondeCrawler {
let browser;

crawl = async () => {
    console.log('LeMonde new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    console.log('got to the page.')
    await page.waitForSelector('section[class*="zone--homepage"]', {timeout: 0})
    console.log('loaded')
    const elementList = await page.$$('section[class*="zone--homepage"] > section > div[class*="article"]')

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    console.log('parsing all news finish.')
    await LeMondeNews.bulkUpsertNews(allNewsResult);
    console.log('inserting into db finish.')
    await page.close();
    await browser.close();
}

parseNews = async (element, idx) => {
    let news = {
        ranking: idx,
    }
    news.title = await element.$eval('[class*="article__title"]', node => node.innerText);
    news.isLive = (await element.$$('[class*="article__title--live"]')).length > 0;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if ((await element.$$('img')).length > 0) {
        news.imageHref = await element.$eval('img', node => node.getAttribute('src'));
    }
    if ((await element.$$('.article__desc')).length > 0) {
        news.summary = await element.$eval('.article__desc', node => node.innerText);
    }
    if ((await element.$$('ul.article__related')).length > 0) {
        news.relatedNewsList = await element.$$eval('ul.article__related li a', nodes => nodes.map(n => {
            return {
                relatedTitle: n.innerText,
                relatedHref: n.getAttribute('href')
            }
        }))
    }
    if (news.isLive) {
        news.liveNewsList = await parseLiveNews(news.articleHref);
    } else {
        news.article = await goToArticlePageAndParse(news.articleHref);
    }
    console.log(news)
    return news;
}


goToArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('section[class*="zone--article"]', {timeout: 0});

    const mainElement = await pageContent.$('section[class*="zone--article"]');

    article.title = await mainElement.$eval('header .article__heading .article__title', node => node.innerText);
    article.summary = await mainElement.$eval('header .article__heading .article__title', node => node.innerText);
    article.date = await mainElement.$eval('span[class*="meta__date--header"]', node => node.getAttribute('datetime'));

    article.bodyBlockList = await mainElement.$$eval('section[class*="article__wrapper"] article[class*="article__content"] [class*="article__"]',
        nodes => nodes.map(n => n.outerHTML));

    await pageContent.close();
    return article;
}

parseLiveNews = async (url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    await pageLive.waitForSelector('section[class*="sirius-live"]', {timeout: 0});
    const liveElementList = await pageLive.$$('section#post-container > section.post.post__live-container');
    await pageLive.close();
    return await Promise.all(liveElementList.map(async element => {
        let liveTitle;
        if ((await element.$$('[class*="post__live-container--title"]')).length > 0) {
            liveTitle = await element.$eval('[class*="post__live-container--title"]', async node => node.innerText)
        } else if ((await element.$$('blockquote.post__live-container--comment-blockquote')).length > 0) {
            liveTitle = await element.$eval('blockquote.post__live-container--comment-blockquote', async node => node.innerText)
        } else {
            liveTitle = await element.$eval('.post__live-container--answer-content', async node => node.innerText)
        }
        return {
            liveTitle,
            liveHref: url,
            liveTime: await element.$eval('span.date', node => node.innerText),
            liveContent: {
                title: liveTitle,
                summary: await element.$eval('.post__live-container--answer-content', node => node.innerHTML)

            }
        };
    }));
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





