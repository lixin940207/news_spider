require('./mongodb_connection');
const NYTimesNews = require('../models/nytimes');
const News = require('../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.NYTimeURL;
const logger = require('../config/logger');

let objs = {};
let browser;

crawl = async () => {
    logger.info('NYTimes a new crawling start.')
    objs = {}
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('loaded.');
    await page.waitForSelector('main#site-content', {timeout: 0});
    logger.info('got dom.');

    const allArticleContainers = await page.$$(
        'section[data-block-tracking-id="Spotlight"]  div[data-hierarchy="zone"] > div > div > div > div > div > div > div > div > div > div, ' +
        'section[data-block-tracking-id="Top Stories"]  div[data-hierarchy="zone"] > div > div');

    const filterConditions = await Promise.all(allArticleContainers.map(async element => {
        let ifDashboard = (await element.$$('section#embeds-top-stories-dashboard')).length > 0;
        let ifEmpty = (await element.evaluate(node => node.innerHTML)).length === 0;
        return !(ifDashboard || ifEmpty);
    }));

    const filteredArticleContainers = allArticleContainers.filter((element, i) => filterConditions[i]);
    const allEligibleLinks = (await Promise.all(filteredArticleContainers.map(async element => {
        return await element.$$('a');
    }))).flat();

    let newsList = allEligibleLinks.map(async (element, idx) => {
        let href = await element.evaluate(node => node.getAttribute('href'));
        const hrefSplit = href.split('/');
        if (hrefSplit[3] === 'interactive' || hrefSplit[4] === 'interactive') return 'ok';

        if (!(href in objs)) {
            objs[href] = { articleHref: href, ranking: idx + 1,}
        }
        const parentNode1 = await element.getProperty('parentNode');
        let hasImage = false;
        const className = (await parentNode1.evaluate(node => node.getAttribute('class')));
        if (className !== null && className.includes('interactive-body')) {
            // interactive type, 暂时不处理video
            // console.log(await element.evaluate(node=>node.outerHTML))
            // objs[href].title = await element.$eval('h3[class="g-hp-hed"]', node => node.innerText);
            // objs[href].summary = await element.$eval('p[class="g-hp-summary"]', node => node.innerText);
            // objs[href].newsType = NewsTypes.CardWithTitleIntro;
            return 'ok'
        }

        if (objs[href].title === undefined && ((await element.$$('h3')).length > 0 || (await element.$$('h2')).length > 0)) {
            objs[href].title = await element.$eval('h3, h2', node => node.innerText);
        }
        if (objs[href].summary === undefined && (await element.$$('p')).length > 0) {
            objs[href].summary = await element.$eval('p', node => node.innerText);
        }
        if (objs[href].imageHref === undefined && (await element.$$('img')).length > 0) {
            objs[href].imageHref = await element.$eval('img', node => node.getAttribute('src'));
        }
        if (objs[href].summary_list === undefined && (await element.$$('ul')).length > 0) {
            objs[href].summary_list = await element.$$eval('li', nodes => nodes.map(
                n => {return {title: n.innerText}})
            );
        }
        objs[href].region = hrefSplit[hrefSplit.length - 2];
        objs[href].isLive = hrefSplit[3] === 'live';
        if (objs[href].isLive && objs[href].liveNewsList === undefined) {
            objs[href].liveNewsList = await parseLiveNews(href);
        }
        if (!objs[href].isLive && objs[href].article === undefined) {
            objs[href].article = await goToArticlePageAndParse(href);
            objs[href].publishTime = objs[href].article.publishTime;
        }
        // logger.info("parsed "+ href)
        return 'ok';
        //}
    })
    await Promise.all(newsList);
    const newsResult = Object.values(objs).map(obj => {
        if (obj.title) obj.newsType = NewsTypes.CardWithTitleWide;
        if (obj.summary) obj.newsType = NewsTypes.CardWithTitleIntro;
        if (obj.summary_list) obj.newsType = NewsTypes.CardWithList;
        if (obj.imageHref) obj.newsType = NewsTypes.CardWithImage;
        if (obj.isLive) obj.newsType = obj.imageHref ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
        return obj;
    })
    logger.info('parsing all news finish.')
    // await NYTimesNews.bulkUpsertNews(newsResult);
    await News.bulkUpsertNews(newsResult.map(element=>{
        return {
            platform:"nytimes",
            ...element
        }
    }));
    logger.info('NYTimes-inserting into db finish.');
    await page.close();
    await browser.close();
}

parseLiveNews = async (url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try{
        await pageLive.waitForSelector('article', {timeout: 0});
    }catch (e) {
        logger.error(url+'has problem!')
    }
    const liveElementList = await pageLive.$$('article div[data-test-id="live-blog-post"]');
    return await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('[itemprop="headline"]', node => node.innerText);
        const liveHref = url + await element.$eval('[itemprop="headline"] a', node => node.getAttribute('href'))
        const liveTime = await pageLive.$eval('time[datetime]', node=>node.getAttribute('datetime'))
        return {
            liveTitle,
            liveHref,
            liveTime,
            liveContent: {
                title: liveTitle,
                articleHref: liveHref,
                publishTime: liveTime,
                bodyBlockList: await element.$$eval(
                    'figure img, p',
                    nodes => nodes.map(
                        n => n.outerHTML
                    ))
            }
        }
    }));
}

goToArticlePageAndParse = async (url) => {
    // console.log('parsing ' + url)
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});
    // console.log('parsed ' + url)
    const bodyElement = await pageContent.$('article section[name="articleBody"]');

    article.title = await pageContent.$eval('h1[data-testid="headline"]', node => node.innerText);
    if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
        article.summary = await pageContent.$eval('p[id="article-summary"]', node => node.innerText);
    }
    if ((await pageContent.$$('div[data-testid="photoviewer-wrapper"] figure picture img')).length > 0) {
        article.headImageHref = await pageContent.$eval('div[data-testid="photoviewer-wrapper"] figure picture img', node => node.getAttribute('src'));
    }
    if ((await pageContent.$$('time[datetime]')).length > 0) {
        article.publishTime = await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime'));
    }


    // logger.info('parsing article: '+ url)
    article.bodyBlockList = await bodyElement.$$eval('div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2', nodes => nodes.map(n => n.outerHTML));

    return article;
}

goToArticleArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article#story', {timeout: 0});
    // console.log('parsed ' + url)
    const headerElement = await pageContent.$('article#story header');
    const bodyElement = await pageContent.$('article#story section[name="articleBody"]');

    if (headerElement !== null){
        if ((await headerElement.$$('h1')).length === 0){
            console.log(url)
            console.log(await headerElement.evaluate(node=>node.outerHTML))
        }
        article.title = await headerElement.$eval('h1', node => node.innerText);
        if ((await headerElement.$$('p[id="article-summary"]')).length > 0) {
            article.summary = await headerElement.$eval('p[id="article-summary"]', node => node.innerText);
        }
        if ((await headerElement.$$('div[data-testid="photoviewer-wrapper"] figure picture img')).length > 0) {
            article.headImageHref = await headerElement.$eval('div[data-testid="photoviewer-wrapper"] figure picture img', node => node.getAttribute('src'));
        }
        if ((await headerElement.$$('time[datetime]')).length > 0) {
            article.publishTime = await headerElement.$eval('time[datetime]', node => node.getAttribute('datetime'));
        }
    } else{
        article.title = await pageContent.$eval('h1', node => node.innerText);
        if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
            article.summary = await pageContent.$eval('p[id="article-summary"]', node => node.innerText);
        }
        if ((await pageContent.$$('div[data-testid="photoviewer-wrapper"] figure picture img')).length > 0) {
            article.headImageHref = await pageContent.$eval('div[data-testid="photoviewer-wrapper"] figure picture img', node => node.getAttribute('src'));
        }
        if ((await pageContent.$$('time[datetime]')).length > 0) {
            article.publishTime = await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime'));
        }
    }

    // logger.info('parsing article: '+ url)
    article.bodyBlockList = await bodyElement.$$eval('div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2', nodes => nodes.map(n => n.outerHTML));

    return article;
}

schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);



