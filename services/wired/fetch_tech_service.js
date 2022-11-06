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

const TECH_URL = require('../../config/config').TECHNOLOGY.WIRED;

let browser;

crawl = async (URL, category) => {
    logger.info('WIRED start crawling.', {
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
    logger.info('Wired loaded.', {
        category,
    })

    // if (await ifSelectorExists(page, 'form.consent-form')) {
    //     await acceptCookie(page);
    // }

    await page.waitForSelector('main#main-content div.verso-best-stories-package', {timeout: 0})

    const news_list = await page.$$('' +
        'main#main-content div.verso-best-stories-package div.summary-collage-four div[data-section-title],' +
        'main#main-content div.summary-collection-row div[data-testid="SummaryCollectionRowItems"] div[data-section-title]')
    logger.info('Wired got dom.', {
        category,
    })

    let allNewsResult = [];
    for (let i = 0; i < news_list.length; i++) {
        allNewsResult.push(await parseNews(news_list[i], i+1, category));
    }
    allNewsResult = allNewsResult.filter(i => i!==undefined);
    logger.info('Wired parsed all objects.', {
        category
    })
    await News.bulkUpsertNews(allNewsResult.map(element=>{
        element.platform = "Wired";
        return element;
    }));
    logger.info('Wired inserted into db.')
    await page.close();
    await browser.close();
}


parseNews = async (element, idx, category) => {
    const news = new NewsObject();
    news.ranking = idx

    news.title.ori = processStr(await element.$eval('[data-testid="SummaryItemHed"]', node => node.innerText));
    news.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.title.ori): "";

    news.imageHref = await getImageHref(element, 'picture.summary-item__image img');
    news.articleHref = await element.$eval('a.summary-item__hed-link', node=>node.getAttribute('href'));
    if (!news.articleHref.startsWith(TECH_URL)) {
        news.articleHref = TECH_URL + news.articleHref;
    }
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    news.newsType = NewsTypes.CardWithImage;
    // news.summary.ori = await element.$eval('div.post-block__content', node => node.innerText);
    // news.summary.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(news.summary.ori) : "";

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



