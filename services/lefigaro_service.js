const puppeteer = require('puppeteer');
const logger = require('../config/logger');
require('./mongodb_connection');
const URL = require('../config/config').ORIGINAL_URLS.LeFigaroURL;
const NewsTypes = require("../models/news_type_enum");
const LeFigaroNews = require('../models/lefigaro');
const News = require('../models/news')
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");

let browser;

crawl = async () => {
    logger.info('LeFigaro a new crawling start.')
    browser = await puppeteer.launch({timeout:0});
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'load', timeout: 0});
    console.log('got to the page.')
    await page.waitForSelector('section.fig-main', {timeout: 0})
    console.log('loaded')
    const elementList = await page.$$('section.fig-main section[class*="fig-ensemble"],' +
        'section.fig-main article[class*="fig-profile"]')

    let promises = [];
    for (let i = 0; i < elementList.length; i++) {
        let p = parseNews(elementList[i], i);
        promises.push(p)
    }
    const allNewsResult = await Promise.all(promises);
    logger.info('parsed all news.')
    // await LeFigaroNews.bulkUpsertNews(allNewsResult.flat());
    await News.bulkUpsertNews(allNewsResult.flat().map(element=>{
        return {
            platform:"lefigaro",
            ...element
        }
    }));
    logger.info('LeFigaro-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx) => {
    let elementClassName = await element.evaluate(node => node.getAttribute('class'))
    if (elementClassName.includes('fig-ensemble')) {
        if ((await element.$$('article[class*="fig-ensemble__first-article"] .fig-live-mark')).length > 0) {
            let news = await parseEnsembleLiveNews(element, idx);
            const otherNews = await element.$$('ul li');
            return [news].concat(await Promise.all(otherNews.map(async node => {
                if ((await node.$$('.fig-live-mark')).length > 0) {
                    let articleHref = await node.$eval('a', node => node.getAttribute('href'));
                    let title = await node.$eval('a', node => node.innerText);
                    return {
                        title: title,
                        articleHref,
                        category: articleHref.split('/')[3],
                        isLive: true,
                        newsType: NewsTypes.CardWithLive,
                        liveNewsList: await parseLiveNews(articleHref),
                    }
                }
            })))
        } else {
            if ((await element.$$('ul li .fig-live-mark')).length > 0) {
                let news = await parseEnsembleNews(element, idx, false);
                let subElementList = await element.$$('ul li');
                let relatedNewsListTemp = await Promise.all(subElementList.map(async node => {
                    if ((await node.$$('.fig-live-mark')).length === 0) {
                        let articleHref = await node.$eval('a', node => node.getAttribute('href'));
                        let title = await node.$eval('a', node => node.innerText);
                        const article = await goToArticlePageAndParse(articleHref);
                        return {
                            title,
                            article,
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
                        return {
                            title,
                            articleHref,
                            category: articleHref.split('/')[3],
                            isLive: true,
                            newsType: NewsTypes.CardWithLive,
                            liveNewsList: await parseLiveNews(articleHref),
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
    let news = {
        ranking: idx,
        newsType: hasRelated ? NewsTypes.CardWithImageAndSubtitle : NewsTypes.CardWithImage
    };
    news.isLive = (await element.$$('fig-live-mark')).length > 0
    news.title = await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText);
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'));
    news.category = news.articleHref.split('/')[3];
    const imageDataSrc = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
    news.imageHref = imageDataSrc[imageDataSrc.length - 2]
    news.summary = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
    news.article = await goToArticlePageAndParse(news.articleHref);
    news.publishTime = news.article.publishTime;
    if (hasRelated) {
        const relatedElementList = await element.$$('ul li');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async node => {
            return {
                title: await node.$eval('a', n => n.innerText),
                article: await goToArticlePageAndParse(await node.$eval('a', n => n.getAttribute('href')))

            }
        }))
    }
    return news;
}

parseProfileOrLiveNews = async (element, idx, isLive) => {
    let news = {
        ranking: idx,
        newsType: isLive ? NewsTypes.CardWithLive : NewsTypes.CardWithTitleIntro
    }
    if ((await element.$$('[class*="fig-profile__headline"]')).length === 0){
        console.log(await element.evaluate(node=>node.outerHTML))
    }
    news.title = await element.$eval('[class*="fig-profile__headline"]', node => node.innerText);
    news.articleHref = await element.$eval('a.fig-profile__link', node => node.getAttribute('href'));
    news.category = news.articleHref.split('/')[3];

    if ((await element.$$('img')).length > 0) {
        const imageDataSrc = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
        news.imageHref = imageDataSrc[imageDataSrc.length - 2]
        news.newsType = isLive? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithImage
    }
    news.summary = await element.$eval('[class*="fig-profile__chapo"]', node => node.innerText);
    if (isLive) {
        news.liveNewsList = await parseLiveNews(news.articleHref);
    } else {
        if (news.articleHref.split(/[./]/)[2] === 'madame') {
            news.article = await goToMadArticlePageAndParse(news.articleHref);
        } else if (news.articleHref.split(/[./]/)[2] === 'etudiant')
        {
            news.article = await goToEduArticlePageAndParse(news.articleHref);
        }
        else{
            news.article = await goToArticlePageAndParse(news.articleHref);
        }
        news.publishTime = news.article.publishTime;
    }
    return news;
}

parseEnsembleLiveNews = async (element, idx) => {
    let news = {
        ranking: idx,
        newsType: NewsTypes.CardWithImageAndLive
    }
    news.title = await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText);
    news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]', node => node.getAttribute('href'))
    news.category = news.articleHref.split('/')[3];
    const imageDataSrc = (await element.$eval('img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
    news.imageHref = imageDataSrc[imageDataSrc.length - 2]
    news.summary = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
    news.isLive = true
    news.liveNewsList = await parseLiveNews(news.articleHref);
    return news;
}

goToArticlePageAndParse = async (url) => {
    // console.log('parse ' + url)
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0,
    });
    await pageContent.bringToFront();
    if ((await pageContent.$$('article.fig-main')).length === 0) {
        console.log(url)
    }
    await pageContent.waitForSelector('article.fig-main', {timeout: 0});

    const mainElement = await pageContent.$('article.fig-main');

    article.title = await mainElement.$eval('[class*="fig-headline"]', node => node.innerText);
    article.summary = await mainElement.$eval('p[class="fig-standfirst"]', node => node.innerText);
    if ((await mainElement.$$('figure[class*="fig-media"] img')).length > 0) {
        // console.log(await mainElement.$eval('figure[class*="fig-media"] img', node=>node.outerHTML));
        const imageDataSrc = (await mainElement.$eval('figure[class*="fig-media"] img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
        article.headImageHref = imageDataSrc[imageDataSrc.length - 2]
    }
    if ((await mainElement.$$("span.fig-content-metas__pub-maj-date time")).length > 0) {
        article.publishTime = await mainElement.$eval('span.fig-content-metas__pub-maj-date time', node => node.getAttribute('datetime'));
    }else{
        article.publishTime = await mainElement.$eval('span[class*="fig-content-metas__pub-date"] time', node => node.getAttribute('datetime'));
    }

    article.bodyBlockList = await mainElement.$$eval('p.fig-paragraph, ' +
        '.fig-body-heading', nodes => nodes.map(n => n.outerHTML));
    return article;
}

goToMadArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('.mad__article__wrapper', {timeout: 30000});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('.mad__article__wrapper');

    article.title = await mainElement.$eval('.mad__titre', node => node.innerText);
    article.summary = await mainElement.$eval('[class*="mad__article__chapo"]', node => node.innerText);
    if ((await mainElement.$$('.main-media img')).length > 0) {
        const imageDataSrc = (await mainElement.$eval('.main-media img', node => node.getAttribute('srcset') || node.getAttribute('data-srcset'))).split(' ');
        article.headImageHref = imageDataSrc[imageDataSrc.length - 2]
    }
    // article.publishTime = await mainElement.$eval('.header-info', node => node.innerText);
    return article;
}

goToEduArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('article.article', {timeout: 30000});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('article.article');

    article.title = await mainElement.$eval('header.article__header h1', node => node.innerText);
    article.summary = await mainElement.$eval('.article__content .content--chapo', node => node.innerText);
    if ((await mainElement.$$('.article__banner img')).length > 0) {
        article.headImageHref = (await mainElement.$eval('.article__banner img', node => node.getAttribute('src'))).split(' ')[0];
    }
    // const timeText = await mainElement.$eval('header.article__header time[itemprop="dateModified"]', node => node.innerText);

    article.bodyBlockList = await mainElement.$$eval('.article__content p:not(.content--chapo), ' +
        '.article__content figure img,' +
        '.article__content h2' +
        '.article__content blockquote', nodes => nodes.map(n => n.outerHTML));
    return article;
}

parseLiveNews = async (url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try {
        await pageLive.waitForSelector('div#live-messages', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }
    const liveElementList = await pageLive.$$('article[class*="live-message"]');
    return await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('[itemprop="headline"]', node => node.innerText)
        return {
            liveTitle,
            liveHref: url,
            liveTime: await element.$eval('time', node => node.getAttribute('datetime')),
            liveContent: {
                title: liveTitle,
                summary: await element.$eval('.live-article', node => node.innerHTML)

            }
        };
    }));
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);


