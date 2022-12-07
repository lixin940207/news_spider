const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
require('../mongodb_connection');
const News = require('../../models/news');
const logger = require('../../config/logger');
const NewsTypes = require("../../models/news_type_enum");
const {processStr} = require("../utils/util");
const {asyncTranslate} = require("../utils/translations");
const {parseArticle} = require("./common");
const {getImageHref} = require("../utils/util");
const {NewsObject} = require("../utils/objects");
const LANG = require("../../config/config").LANGUAGE.WIRED;
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

    const oriTitle = processStr(await element.$eval('[data-testid="SummaryItemHed"]', node => node.innerText));
    news.title = await asyncTranslate(oriTitle, LANG);

    news.imageHref = await getImageHref(element, 'picture.summary-item__image img');
    news.articleHref = await element.$eval('a.summary-item__hed-link', node=>node.getAttribute('href'));
    if (!news.articleHref.startsWith(TECH_URL)) {
        news.articleHref = TECH_URL + news.articleHref;
    }
    if (news.articleHref.includes('#intcid=')) {
        news.articleHref = news.articleHref.substring(0, news.articleHref.indexOf('#intcid=')) + '/';
    }
    news.article = await parseArticle(browser, news.articleHref);
    news.publishTime = news.article.publishTime;

    news.newsType = NewsTypes.CardWithImage;

    news.categories = [category];
    logger.info("parsed news ", { href: news.articleHref});
    return news;
}

if (process.env.ENV === 'PRODUCTION') {
    schedule.scheduleJob("48 * * * *", () => crawl(TECH_URL, "Tech"));
} else {
    crawl(TECH_URL, "Tech")
        .then(() => process.exit())
        .catch(r => {
                logger.error(r);
                process.exit(1);
            }
        );
}



