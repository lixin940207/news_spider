const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const {asyncTranslate} = require("../nlp_utils/translations");
const {parseArticle} = require("./common");
const {ifSelectorExists, getImageHref, processStr, determineCategory} = require("../utils/util");
const {NewsObject} = require("../utils/objects");

const BASE_URL = 'https://www.bbc.com';
const TECH_URL = require('../../config/config').TECHNOLOGY.BBCURL;
const LANG = require('../../config/config').LANGUAGE.BBC;

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

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i + 1, category));
    }
    allNewsResult = allNewsResult.filter(i => i !== undefined);
    logger.info('BBC-parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element => {
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


    const oriTitle = processStr(await element.$eval('div.gs-c-promo-body .gs-c-promo-heading .gs-c-promo-heading__title', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);
    news.categories = [category, ...determineCategory(oriTitle)];

    news.imageHref = await getImageHref(element, 'div.gs-c-promo-image img');
    // if (news.imageHref !== undefined) news.newsType = NewsTypes.CardWithImage;
    news.articleHref = BASE_URL + await element.$eval('div.gs-c-promo-body a.gs-c-promo-heading', node => node.getAttribute('href'));
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    if (await ifSelectorExists(element, 'div.gs-c-promo-body div.nw-c-top-stories-primary__related-content')) {
        news.newsType = NewsTypes.CardWithImageAndSubtitle;
        const relatedElementList = await element.$$('div.gs-c-promo-body div.nw-c-top-stories-primary__related-content li.nw-c-related-story a');
        news.relatedNewsList = await Promise.all(relatedElementList.map(async element => {
            const articleHref = await element.evaluate(node => node.getAttribute('href'));
            const title = processStr(await element.evaluate(node => node.innerText));
            return {
                title: await asyncTranslate(title, LANG),
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
    logger.info("parsed news ", {href: news.articleHref});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("6 * * * *", () => crawl(TECH_URL, "Tech"));
} else {
    crawl(TECH_URL, "Tech")
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}
