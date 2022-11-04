require('../mongodb_connection');
const News = require('../../models/news')
const puppeteer = require('puppeteer');
const NewsTypes = require("../../models/news_type_enum");
const schedule = require("node-schedule");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");
const URL = require('../../config/config').ORIGINAL_URLS.BFMURL;
const logger = require('../../config/logger');
const moment = require('moment');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {NewsObject} = require("../utils/objects");
const {getDisplayOrder} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {goToDetailPageAndParse, parseLiveNews} = require("./common");
const {determineCategory} = require("../utils/util");
moment.locale('en');

let browser;

crawl = async () => {
    const current_ts = Math.floor(Date.now() / 60000);
    logger.info('BFM new crawling start.'+  current_ts)
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
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
    const newsResult = allNewsResult.filter(i=>i!==undefined);

    logger.info('BFM parsing all objects finish.')
    await News.bulkUpsertNews(newsResult.map(element => {
        element.platform = 'BFM';
        element.displayOrder = element.ranking * 0.01 - current_ts;
        return element;
    }));
    logger.info('BFM inserting into db finish.');
    await browser.close();
}

parseNews = async (element, idx) => {
    if ((await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_externe')){
        return;
    }
    const news = new NewsObject();
    news.ranking = idx;
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.startsWith('/')) news.articleHref = URL + news.articleHref;
    news.imageHref = await getImageHref(element);
    if ((await element.$$('.title_une_item')).length > 0){
        news.title.ori = processStr(await element.$eval('.title_une_item', node=>node.innerText));
    }else{
        news.title.ori = processStr(await element.$eval('.content_item_title', node => node.innerText));
    }
    news.categories = determineCategory(news.title.ori);
    news.isLive = (await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_live');
    news.isVideo = (await element.evaluate(node=>node.getAttribute('class'))).includes('content_type_video');
    if (news.isLive && news.title.ori.startsWith('EN DIRECT - ')) news.title.ori = news.title.ori.split('EN DIRECT - ')[1];
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";

    news.newsType = NewsTypes.CardWithImage;
    if (news.isLive) {
        const {liveNewsList, latestTime} = await parseLiveNews(browser, news.articleHref);
        news.liveNewsList = liveNewsList;
        news.publishTime = latestTime;
        news.newsType = NewsTypes.CardWithImageAndLive;
    } else {
        const article = await goToDetailPageAndParse(browser, news.articleHref);
        if(article !== null){
            news.article = article;
            news.publishTime = news.article.publishTime
        }else{
            return;
        }
    }
    return news;
}


// schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
crawl()
    .then(s => process.exit())
    .catch(r => {
            logger.error(r);
            process.exit(1);
        }
    );





