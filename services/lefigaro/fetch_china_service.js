const puppeteer = require('puppeteer');
const logger = require('../../config/logger');
require('../mongodb_connection');
const URL = require('../../config/config').CHINA_NEWS_URLS.LeFigaroURL;
const NewsTypes = require("../../models/news_type_enum");
const News = require('../../models/news')
const schedule = require("node-schedule");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {processStr} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {getImageHref} = require("../utils/util");
const {parseArticle} = require("./common");
const {ifSelectorExists, determineCategory} = require("../utils/util");
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require("../../config/config");

let browser;

crawl = async () => {
    logger.info('LeFigaro china objects start crawling.')
    browser = await puppeteer.launch({
        timeout:0,
    });
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'load'});
    logger.info('LeFigaro China got to the page.');
    await page.waitForSelector('section.fig-main');
    logger.info('loaded');
    const elementList = await page.$$('section.fig-main article.fig-profile')

    // let promises = [];
    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
        // promises.push(p)
        // await p;
    }
    // const allNewsResult = await Promise.all(promises);

    // console.log(allNewsResult.map(i=>i.publishTime));
    logger.info('LeFigaro parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.flat()
        .filter(element => element !== undefined)
        .map(element=>{
        element.platform = "LeFigaro";
        return element;
    }));
    logger.info('LeFigaro-inserted into db.')
    await page.close();
    await browser.close();
}

parseNews = async (element, idx) => {
    const news = new NewsObject();
    news.ranking = idx;
    news.title.ori = processStr(await element.$eval('.fig-profile__headline', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(news.title.ori):"";
    news.categories = ['China'];
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[4] === 'video') {
        return undefined;
    }
    news.newsType = NewsTypes.CardWithTitleWide;
    news.imageHref = await getImageHref(element, 'figure.fig-profile__media img');
    if (news.imageHref !== undefined){
        news.newsType = NewsTypes.CardWithImage;
    }
    if (await ifSelectorExists(element, 'p.fig-profile__chapo')){
        news.summary.ori = processStr(await element.$eval('p.fig-profile__chapo', node => node.innerText));
        news.summary.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.summary.ori) : "";
        news.newsType = news.imageHref!==undefined?NewsTypes.CardWithImageAndSummary:NewsTypes.CardWithTitleIntro;
    }
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    logger.info('parsed ' + news.articleHref);
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

