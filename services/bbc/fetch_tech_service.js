const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const {CRAWL_TIME_INTERVAL, ENABLE_TRANSLATE} = require('../../config/config');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const moment = require('moment-timezone');
const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {parseTime, parseArticle} = require("./common");
const {ifSelectorExists, determineCategory, getImageHref} = require("../utils/util");
const {NewsObject} = require("../utils/objects");

const BASE_URL = 'https://www.bbc.com';
const CHINA_URL = require('../../config/config').CHINA_NEWS_URLS.BBCURL;
const TECH_URL = require('../../config/config').TECHNOLOGY.BBCURL;

let browser;

crawl = async (URL, category) => {
    logger.info('BBC start crawling.', {
        category,
        URL,
    });
    browser = await puppeteer.launch({
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    logger.info('BBC-loaded.', {
        category,
    })
    await page.waitForSelector('div[aria-label="Top Stories"]', {timeout: 0})

    const news_list = await page.$$('div[aria-label="Top Stories"] div.gs-c-promo.gs-t-News')
    logger.info('BBC-got dom.', {
        category,
    })

    let promises = [];
    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i+1, category));
        // promises.push(p);
    }
    // const allNewsResult = (await Promise.all(promises)).filter(i=>i!==undefined);
    allNewsResult = allNewsResult.filter(i => i!==undefined);
    logger.info('BBC-parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "BBC";
        return element;
    }));
    logger.info('BBC-inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx, category) => {
    const news = new NewsObject();
    news.ranking = idx
    news.title.ori = processStr(await element.$eval('div.gs-c-promo-body .gs-c-promo-heading .gs-c-promo-heading__title', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";

    news.imageHref = await getImageHref(element, 'div.gs-c-promo-image img');
    // if (news.imageHref !== undefined) news.newsType = NewsTypes.CardWithImage;
    news.articleHref = BASE_URL + await element.$eval('div.gs-c-promo-body a.gs-c-promo-heading', node=>node.getAttribute('href'));
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    if (await ifSelectorExists(element, 'div.gs-c-promo-body div.nw-c-top-stories-primary__related-content')) {
        news.newsType = NewsTypes.CardWithImageAndSubtitle;
        const relatedElementList = await element.$$('div.gs-c-promo-body div.nw-c-top-stories-primary__related-content li.nw-c-related-story a');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            const articleHref = await element.evaluate(node => node.getAttribute('href'));
            const title = processStr(await element.evaluate(node => node.innerText));
            return {
                title: {
                    ori: title,
                    cn: ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(title) : "",
                },
                article: await parseArticle(browser, BASE_URL + articleHref)
            }
        }))
    } else {
        if (news.imageHref !== undefined) {
            news.newsType = NewsTypes.CardWithTitleWide;
        } else {
            news.newsType = NewsTypes.CardWithTitleWide;
        }
    }
    news.categories = [category];
    logger.info("parsed news ", { title: news.title.ori});
    return news;
}


schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
// crawl(CHINA_URL, "China")
//     .then(s => process.exit())
//     .catch(r => {
//             logger.error(r);
//             process.exit(1);
//         }
//     );

crawl(TECH_URL, "Tech")
    .then(s => process.exit())
    .catch(r => {
            logger.error(r);
            process.exit(1);
        }
    );



