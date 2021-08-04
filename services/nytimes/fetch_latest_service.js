require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.NYTimeURL;
const logger = require('../../config/logger');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {parseChineseArticle} = require("./common");
const {parseArticle} = require("./common");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {goToArticleArticlePageAndParse} = require("./common");
const {parseLiveNews, goToArticlePageAndParse} = require("./common");
const {determineCategory} = require("../utils/util");
const BASE_URL = "https://www.nytimes.com/";

let objs = {};
let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('NYTimes a new crawling start.' + current_ts);
    objs = {}
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('NYTimes loaded.');
    await page.waitForSelector('main#site-content', {timeout: 0});
    logger.info('NYTimes got dom.');

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
        href = href.split('?')[0];
        if(href.endsWith('/')) href = href.substring(0, href.length - 1);
        const hrefSplit = href.split('/');
        if (hrefSplit[3] === 'interactive' || hrefSplit[4] === 'interactive' || hrefSplit[3] === 'news-event') return 'ok';

        if (!(objs.hasOwnProperty(href))) {
            objs[href] = new NewsObject();
            objs[href].articleHref = href;
            objs[href].ranking = idx;
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

        if (objs[href].title.ori === undefined && ((await element.$$('h3, h2')).length > 0)) {
            objs[href].title.ori = processStr(await element.$eval('h3, h2', node => node.innerText));
            objs[href].title.cn = await pushToQueueAndWaitForTranslateRes(objs[href].title.ori);
            objs[href].categories = determineCategory(objs[href].title.ori);
        }
        if (objs[href].summary.ori === undefined && (await element.$$('p')).length > 0) {
            objs[href].summary.ori = processStr(await element.$eval('p', node => node.innerText));
            objs[href].summary.cn = await pushToQueueAndWaitForTranslateRes(objs[href].summary.ori);
        }
        if (objs[href].imageHref === undefined) {
            objs[href].imageHref = await getImageHref(element, 'img');
        }
        // if (objs[href].relatedNewsList.length === 0 && (await element.$$('ul')).length > 0) {
        //     objs[href].relatedNewsList = await element.$$eval('li', nodes => nodes.map(
        //         async n => {
        //             return {
        //                 title: {
        //                     ori: n.innerText,
        //                     cn: await translateText(n.innerText)
        //                 },
        //             }
        //         })
        //     );
        // }
        objs[href].region = hrefSplit[hrefSplit.length - 2];
        objs[href].isLive = hrefSplit[3] === 'live';
        if (objs[href].isLive && objs[href].liveNewsList.length === 0) {
            const {liveNewsList, publishTime} = await parseLiveNews(browser, href);
            objs[href].liveNewsList = liveNewsList;
            objs[href].publishTime = publishTime;
        }
        if (!objs[href].isLive && objs[href].article === undefined) {
            objs[href].article = await parseArticle(browser, href);
            objs[href].publishTime = objs[href].article.publishTime;
        }
        return 'ok';
    })
    await Promise.all(newsList);
    const newsResult = Object.values(objs).map((obj, idx) => {
        obj.ranking = idx;
        if (obj.title.ori !== undefined) obj.newsType = NewsTypes.CardWithTitleWide;
        if (obj.summary.ori !== undefined) obj.newsType = NewsTypes.CardWithTitleIntro;
        if (obj.relatedNewsList.length > 0) obj.newsType = NewsTypes.CardWithList;
        if (obj.imageHref !== undefined) obj.newsType = NewsTypes.CardWithImage;
        if (obj.isLive !== undefined && obj.isLive) obj.newsType = obj.imageHref ? NewsTypes.CardWithImageAndLive : NewsTypes.CardWithLive;
        return obj;
    })
    logger.info('NYTimes parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'NYTimes';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('NYTimes-inserting into db finish.');
    await page.close();
    await browser.close();
}

// schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
crawl().then(r => {})



