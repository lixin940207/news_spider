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
const {parseArticle, acceptCookie} = require("./common");
const {ifSelectorExists, determineCategory, getImageHref} = require("../utils/util");
const {NewsObject} = require("../utils/objects");

const BASE_URL = "https://techcrunch.com"
const TECH_URL = require('../../config/config').TECHNOLOGY.TechCrunchURL;

let browser;

crawl = async (URL, category) => {
    logger.info('TechCrunch start crawling.', {
        category,
        URL,
    });
    browser = await puppeteer.launch({
        args: ['--no-sandbox']});
    const page = await browser.newPage();

    await page.goto(URL, {
        waitUntil: 'load',
        timeout: 0
    });
    // await page.screenshot({path: 'screenshot.png'});
    logger.info('TechCrunch loaded.', {
        category,
    })

    if (await ifSelectorExists(page, 'form.consent-form')) {
        await acceptCookie(page);
    }

    await page.waitForSelector('div#tc-main-content div[class="content-wrap "] div.content div[class="river river--homepage "]', {timeout: 0})

    const news_list = await page.$$('div#tc-main-content div[class="content-wrap "] div.content div[class="river river--homepage "] article.post-block.post-block--image')
    logger.info('TechCrunch got dom.', {
        category,
    })

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i+1, category));
    }
    allNewsResult = allNewsResult.filter(i => i!==undefined);
    logger.info('TechCrunch parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "TechCrunch";
        return element;
    }));
    logger.info('TechCrunch inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx, category) => {
    const news = new NewsObject();
    news.ranking = idx
    if (await ifSelectorExists(element, 'header.post-block__title .article__event-title')) {
        return null;
    }

    news.title.ori = processStr(await element.$eval('header.post-block__header h2.post-block__title', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";

    news.imageHref = await getImageHref(element, 'footer.post-block__footer img');
    news.articleHref = BASE_URL + await element.$eval('header.post-block__header h2.post-block__title a.post-block__title__link', node=>node.getAttribute('href'));
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    news.newsType = NewsTypes.CardWithImageAndSummary;
    news.summary.ori = await element.$eval('div.post-block__content', node => node.innerText);
    news.summary.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.summary.ori) : "";

    news.categories = [category];
    logger.info("parsed news ", { title: news.title.ori});
    return news;
}


// schedule.scheduleJob(CRAWL_TIME_INTERVAL, crawl);
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



