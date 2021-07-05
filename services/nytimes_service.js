const NYTimesNews = require('../models/nytimes');
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../config/config");
const URL = require('../config/config').ORIGINAL_URLS.NYTimeURL;

objs = {};
let browser;

crawl = async () => {
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    await page.waitForSelector('main#site-content', {timeout: 0})

    const allArticleContainers = await page.$$('section[data-block-tracking-id="Spotlight"] > div, ' +
        'section[data-block-tracking-id="Top Stories"] > div > div:not([color])')

    const filterConditions = await Promise.all(allArticleContainers.map(async element => {
        let ifDashboard = (await element.$$('section#embeds-top-stories-dashboard')).length > 0;
        let ifEmpty = (await element.evaluate(node => node.innerHTML)).length === 0;
        return !(ifDashboard || ifEmpty);
    }))
    const filteredArticleContainers = allArticleContainers.filter((element, i) => filterConditions[i])

    const allEligibleLinks = (await Promise.all(filteredArticleContainers.map(async element => {
        return await element.$$('a');
    }))).flat();

    let newsList = allEligibleLinks.map(async (element, idx) => {
        //return async () => {
        let href = await element.evaluate(node => node.getAttribute('href'));
        if (!(href in this.objs)) {
            this.objs[href] = {
                articleHref: href,
                ranking: idx + 1,
            }
        }
        const parentNode1 = await element.getProperty('parentNode');
        let hasImage = false;
        const className = (await parentNode1.evaluate(node => node.getAttribute('class')));
        if (className !== null && className.includes('interactive-body')) {
            // interactive type, 暂时不处理video
            this.objs[href].title = await element.$eval('h3[class="g-hp-hed"]', node => node.innerText);
            this.objs[href].summary = await element.$eval('p[class="g-hp-summary"]', node => node.innerText);
            this.objs[href].newsType = NewsTypes.CardWithTitleIntro;
        } else {
            if (this.objs[href].title === undefined && ((await element.$$('h3')).length > 0 || (await element.$$('h2')).length > 0)) {
                this.objs[href].title = await element.$eval('h3, h2', node => node.innerText);
            }
            if (this.objs[href].summary === undefined && (await element.$$('p')).length > 0) {
                this.objs[href].summary = await element.$eval('p', node => node.innerText);
            }
            if (this.objs[href].imageHref === undefined && (await element.$$('img')).length > 0) {
                this.objs[href].imageHref = await element.$eval('img', node => node.getAttribute('src'));
                hasImage = true;
            }
            if (this.objs[href].summary_list === undefined && (await element.$$('ul')).length > 0) {
                this.objs[href].summary_list = await element.$$eval('li', nodes => nodes.map(
                    n => {
                        return {title: n.innerText}
                    })
                );
            }
        }
        const hrefSplit = href.split('/');
        // if (hrefSplit[3] === 'interactive') return; // don't save covid dashboard
        this.objs[href].region = hrefSplit[hrefSplit.length - 2];
        this.objs[href].isLive = hrefSplit[3] === 'live';
        if (this.objs[href].isLive) {
            this.objs[href].liveObjList = await this.parseLiveNews(href);
        } else {
            if (this.objs[href].article === undefined) this.objs[href].article = await this.goToArticlePageAndParse(href);
        }
        return 'ok';
        //}
    })
    await Promise.all(newsList);
    const newsResult = Object.values(this.objs).map(obj => {
        if (obj.title) obj.newsType = NewsTypes.CardWithTitle;
        if (obj.summary) obj.newsType = NewsTypes.CardWithTitleIntro;
        if (obj.summary_list) obj.newsType = NewsTypes.CardWithList;
        if (obj.imageHref) obj.newsType = NewsTypes.CardWithImage;
        if (obj.isLive) obj.newsType = obj.imageHref ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
        return obj;
    })
    console.log('parsing all news finish.')
    await NYTimesNews.bulkUpsertNews(newsResult);
    console.log('inserting into db finish.');
    await page.close();
    await browser.close();
}

parseLiveNews = async (url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    await pageLive.waitForSelector('aside', {timeout: 0});
    const liveElementList = await pageLive.$$('aside li');
    await pageLive.close();
    return await Promise.all(liveElementList.map(async element => {
        return await element.$eval('a', node => {
            return {
                liveTitle: node.getAttribute('href'),
                liveHref: node.innerText
            };
        });
    }));
}

goToArticlePageAndParse = async (url) => {
    let article = {};
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article[id="story"]', {timeout: 0});

    const headerElement = await pageContent.$('article[id="story"] header');
    const bodyElement = await pageContent.$('article[id="story"] section[name="articleBody"]');

    article.title = await headerElement.$eval('h1', node => node.innerText);
    if ((await headerElement.$$('p[id="article-summary"]')).length > 0) {
        article.summary = await headerElement.$eval('p[id="article-summary"]', node => node.innerText);
    }
    if ((await headerElement.$$('div[data-testid="photoviewer-wrapper"] figure picture img')).length > 0) {
        article.headImageHref = await headerElement.$eval('div[data-testid="photoviewer-wrapper"] figure picture img', node => node.getAttribute('src'));
    }
    if ((await headerElement.$$('time')).length > 0) {
        article.date = await headerElement.$eval('time', node => node.innerText);
    }
    article.bodyBlockList = await bodyElement.$$eval('div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2,' +
        'div[data-testid="photoviewer-wrapper"] figure', nodes => nodes.map(n => n.outerHTML));

    await pageContent.close();
    return article;
}

schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);



