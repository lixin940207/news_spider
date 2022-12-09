const puppeteer = require('puppeteer');
const logger = require('../../config/logger');
require('../mongodb_connection');
const URL = require('../../config/config').CHINA_NEWS_URLS.LeFigaroURL;
const NewsTypes = require("../../models/news_type_enum");
const News = require('../../models/news')
const schedule = require("node-schedule");
const {asyncTranslate} = require("../nlp_utils/translations");
const {processStr, getImageHref, ifSelectorExists, determineCategory} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const {parseArticle} = require("./common");
const LANG = require("../../config/config").LANGUAGE.LeFigaro;

let browser;

crawl = async () => {
    logger.info('LeFigaro china objects start crawling.')
    browser = await puppeteer.launch({
        timeout: 0,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(URL, {waitUntil: 'load'});
    logger.info('LeFigaro China got to the page.');
    await page.waitForSelector('section.fig-main');
    logger.info('loaded');
    const elementList = await page.$$('section.fig-main article.fig-profile')

    let allNewsResult = [];
    for (let i = 0; i < elementList.length; i++) {
        allNewsResult.push(await parseNews(elementList[i], i));
    }

    logger.info('LeFigaro parsed all objects.')
    await News.bulkUpsertNews(allNewsResult.flat()
        .filter(element => element !== undefined)
        .map(element => {
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
    const oriTitle = processStr(await element.$eval('.fig-profile__headline', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = ['China', ...determineCategory(oriTitle)];
    news.articleHref = await element.$eval('a', node => node.getAttribute('href'));
    if (news.articleHref.split('/')[4] === 'video') {
        return undefined;
    }
    news.newsType = NewsTypes.CardWithTitleWide;
    news.imageHref = await getImageHref(element, 'figure.fig-profile__media img');
    if (news.imageHref !== undefined) {
        news.newsType = NewsTypes.CardWithImage;
    }
    if (await ifSelectorExists(element, 'p.fig-profile__chapo')) {
        const oriSummary = processStr(await element.$eval('p.fig-profile__chapo', node => node.innerText));
        news.summary = await asyncTranslate(oriSummary, LANG);
        news.newsType = news.imageHref !== undefined ? NewsTypes.CardWithImageAndSummary : NewsTypes.CardWithTitleIntro;
    }
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;
    logger.info('parsed ' + news.articleHref);
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("21 * * * *", crawl);
} else {
    crawl()
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
