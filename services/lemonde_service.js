require('./mongodb_connection');
const LeMondeNews = require('../models/lemonde');
const News = require('../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.LeMondeURL;
const logger = require('../config/logger');
const {ifSelectorExists} = require("./utils/util");

let browser;

crawl = async () => {
    logger.info('LeMonde new crawling start.')
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        timeout: 0,
        waitUntil: "load",
    });
    logger.info('got to the page.')
    await page.waitForSelector('section[class*="zone--homepage"]', {timeout: 0})
    logger.info('loaded')
    const elementList = await page.$$('section[class*="zone--homepage"] > section > div[class*="article"]')

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsing all news finish.')
    // await LeMondeNews.bulkUpsertNews(allNewsResult);
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        return {
            platform:"lemonde",
            ...element
        }
    }));
    logger.info('LeMonde-inserting into db finish.')
    await browser.close();
}

parseNews = async (element, idx) => {
    let news = {
        ranking: idx,
    }
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    news.category = news.articleHref.split('/')[3];
    news.title = await element.$eval('[class*="article__title"]', node => node.innerText);
    news.newsType = NewsTypes.CardWithTitleWide;
    if ((await element.$$('.article__desc')).length > 0) {
        news.summary = await element.$eval('.article__desc', node => node.innerText);
        news.newsType = NewsTypes.CardWithTitleIntro;
    }
    let hasImage = false;
    if ((await element.$$('img[src]')).length > 0) {
        news.imageHref = await element.$eval('img[src]', node => node.getAttribute('src'));
        hasImage = true;
        news.newsType = NewsTypes.CardWithImage
    }
    let hasRelated = false;
    if ((await element.$$('ul.article__related')).length > 0) {
        const relatedElementList = await element.$$('ul.article__related li a');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            if((await element.$$('[class*="flag-live-cartridge"]')).length > 0){
                return {
                    title: await element.evaluate(node=>node.innerText),
                }
            }else{
                return {
                    title: await element.evaluate(node=>node.innerText),
                    article: await goToArticlePageAndParse(await element.evaluate(node=>node.getAttribute('href'))),
                }
            }

        }))
        news.newsType = NewsTypes.CardWithImageAndSubtitle
    }
    news.isLive = (await element.$$('[class*="flag-live-cartridge"]')).length > 0;
    if (news.isLive) {
        news.liveNewsList = await parseLiveNews(news.articleHref);
        news.newsType = hasImage ? (hasRelated ? NewsTypes.CardWithImageAndLiveAndSubtitle : NewsTypes.CardWithImageAndLive) : NewsTypes.CardWithLive;
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
    await pageContent.waitForSelector('main', {timeout: 0});

    if (url.split('/')[3] === 'blog'){
        article.title = await pageContent.$eval('main#main .entry-title', node => node.innerText);
        article.publishTime = await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime'));
        article.bodyBlockList = await pageContent.$$eval('.entry-content img,' +
            '.entry-content p',
            nodes => nodes.map(n => n.outerHTML));
        return article;
    }else {
        if (await ifSelectorExists(pageContent, 'article#Longform')){
            //console.log(await pageContent.$eval('article#Longform .article__heading', node=>node.outerHTML))
            article.title = await pageContent.$eval('article#Longform .article__heading h1', node => node.innerText);
            article.summary = await pageContent.$eval('article#Longform .article__heading .article__info .article__desc', node => node.innerText);
            const dateHeader = await pageContent.$eval('article#Longform .article__heading .meta__publisher', node => node.innerText);
            const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
            let date = new Date();
            date.setHours(Number(currentTime.split('h')[0]))
            date.setMinutes(Number(currentTime.split('h')[1]))
            article.publishTime = date;
            article.bodyBlockList = await pageContent.$$eval(
                'article#longform .article__content [class*="article__paragraph"], ' +
                'article#longform .article__content [class*="article__sub-title"], ' +
                'article#longform .article__content blockquote,' +
                'article#longform .article__content figure img',
                nodes => nodes.map(n => n.outerHTML));
        }else{
            article.title = await pageContent.$eval('header[class*="article__header"] .article__title', node => node.innerText);
            article.summary = await pageContent.$eval('header[class*="article__header"] .article__desc', node => node.innerText);

            const dateHeader = await pageContent.$eval('header[class*="article__header"] span[class*="meta__date"]', node => node.innerText);
            const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
            let date = new Date();
            date.setHours(Number(currentTime.split('h')[0]))
            date.setMinutes(Number(currentTime.split('h')[1]))
            article.publishTime = date;

            article.bodyBlockList = await pageContent.$$eval(
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__paragraph"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__sub-title"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] blockquote',
                nodes => nodes.map(n => n.outerHTML));
        }
        return article;
    }

}



parseLiveNews = async (url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    await pageLive.waitForSelector('section[class*="sirius-live"]', {timeout: 0});
    const liveElementList = await pageLive.$$('section#post-container > section.post.post__live-container');
    return await Promise.all(liveElementList.map(async element => {
        let liveTitle = '';
        if ((await element.$$('[class*="post__live-container--title"]')).length > 0) {
            liveTitle = await element.$eval('[class*="post__live-container--title"]', async node => node.innerText)
        }
        else if ((await element.$$('blockquote.post__live-container--comment-blockquote')).length > 0) {
            liveTitle = await element.$eval('blockquote.post__live-container--comment-blockquote', async node => node.innerText)
        } else if ((await element.$$('.post__live-container--answer-content')).length > 0){
            liveTitle = await element.$eval('.post__live-container--answer-content', async node => node.innerText)
        }
        const timeText = await element.$eval('span.date', node => node.innerText);
        let liveTime = new Date();
        liveTime.setHours(Number(timeText.split(':')[0]));
        liveTime.setMinutes(Number(timeText.split(':')[1]));
        return {
            liveTitle,
            liveHref: url,
            liveTime,
            liveContent: {
                title: liveTitle,
                bodyBlockList: await element.$$eval('.content--live .post__live-container--answer-content p, ' +
                    '.content--live .article__unordered-list,' +
                    '.content--live [class*="post__live-container--tweet"]', nodes=>nodes.map(n=>n.outerHTML)),
            }
        };
    }));
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);





