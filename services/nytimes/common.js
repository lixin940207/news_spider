const logger = require("../../config/logger");
const assert = require("assert");
const {asyncTranslate} = require("../utils/translations");
const {processStr} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const LANG = require("../../config/config").LANGUAGE.NYTimes;

const BASE_URL = "https://www.nytimes.com/";


parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try {
        await pageLive.waitForSelector('article[data-testid="live-blog-content"]', {timeout: 0});
    } catch (e) {
        logger.error(url + ' has problem!')
    }
    const liveTime = new Date(await pageLive.$eval('time[datetime]', node => node.getAttribute('datetime')));
    const liveElementList = await pageLive.$$('article[data-testid="live-blog-content"] section[id="live-feed-items"] div[data-testid="live-blog-post"]');
    // 'article[data-testid="live-blog-content"] section[id="live-feed-items"] div[data-testid="reporter-update"]');
    const liveNewsList = await Promise.all(liveElementList.map(async element => {
        const liveTitle = processStr(await element.$eval('div.live-blog-post-headline', node => node.innerText));
        const liveHref = url + await element.$eval('div.live-blog-post-headline a', node => node.getAttribute('href'));
        return {
            liveTitle: await asyncTranslate(liveTitle, LANG),
            liveHref,
            liveContent: {
                articleHref: liveHref,
                publishTime: liveTime,
                bodyBlockList: await getBodyBlockList(element,
                    'figure img, p', LANG),
            }
        }
    }))
    let mainImageHref;
    if (await ifSelectorExists(pageLive, 'header.live-blog-header figure img')) {
        mainImageHref = await getImageHref(pageLive, 'header.live-blog-header figure img');
    } else {
        const headerHTML = await pageLive.$eval('header.live-blog-header', node => node.outerHTML);
        mainImageHref = headerHTML.match(/src":"([a-zA-Z0-9./:-]+\.jpg)/)[1];
    }
    return {mainImageHref, publishTime: liveTime, liveNewsList};
}

parseArticle = async (browser, url) => {
    if (url.split(BASE_URL)[1].startsWith('/article/')) {
        return await goToArticleArticlePageAndParse(browser, url);
    } else {
        return await goToArticlePageAndParse(browser, url);
    }
}

goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});
    const bodyElement = await pageContent.$('article section[name="articleBody"]');
    if (!(await ifSelectorExists(pageContent, 'h1[data-testid="headline"]'))) {
        console.log(url);
    }
    const oriTitle = await pageContent.$eval('h1[data-testid="headline"]', node => node.innerText);
    article.title = await asyncTranslate(oriTitle, LANG);
    if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
        const oriSummary = await pageContent.$eval('p[id="article-summary"]', node => node.innerText);
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    article.headImageHref = await getImageHref(pageContent, 'div[data-testid="photoviewer-wrapper"] figure picture img');
    if ((await pageContent.$$('time[datetime]')).length > 0) {
        article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
    }
    article.bodyBlockList = await getBodyBlockList(bodyElement, 'div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2', LANG);

    if (await ifSelectorExists(pageContent, 'article header a[data-version="zh-hans"]')) {
        const ChineseUrl = await pageContent.$eval('article header a[data-version="zh-hans"]', node => node.getAttribute('href'));
        const chineseArticle = await parseChineseArticle(browser, ChineseUrl);
        article.title.zh = chineseArticle.title.zh;
        // article.summary.zh = chineseArticle.summary.zh;
        assert(chineseArticle.bodyBlockList.length === article.bodyBlockList.length);
        article.bodyBlockList = article.bodyBlockList.map((item, i) => {
                if (['p', 'h2', 'blockquote', 'ul'].includes(i.type)) {
                    item.zh = chineseArticle.bodyBlockList[i].zh
                }
                return item;
            }
        )
    }
    return article;
}

goToArticleArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article#story', {timeout: 0});
    // console.log('parsed ' + url)
    const headerElement = await pageContent.$('article#story header');
    const bodyElement = await pageContent.$('article#story section[name="articleBody"]');

    if (headerElement !== null) {
        if ((await headerElement.$$('h1')).length === 0) {
            console.log(url)
            console.log(await headerElement.evaluate(node => node.outerHTML))
        }
        const oriTitle = processStr(await headerElement.$eval('h1', node => node.innerText));
        article.title = await asyncTranslate(oriTitle, LANG);
        if ((await headerElement.$$('p[id="article-summary"]')).length > 0) {
            const oriSummary = processStr(await headerElement.$eval('p[id="article-summary"]', node => node.innerText));
            article.summary = await asyncTranslate(oriSummary, LANG);
        }
        article.headImageHref = await getImageHref(headerElement, 'div[data-testid="photoviewer-wrapper"] figure picture img');
        if ((await headerElement.$$('time[datetime]')).length > 0) {
            article.publishTime = new Date(await headerElement.$eval('time[datetime]', node => node.getAttribute('datetime')));
        }
    } else {
        const oriTitle = processStr(await pageContent.$eval('h1', node => node.innerText));
        article.title = await asyncTranslate(oriTitle, LANG);
        if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
            const oriSummary = processStr(await pageContent.$eval('p[id="article-summary"]', node => node.innerText));
            article.summary = await asyncTranslate(oriSummary, LANG);
        }
        article.headImageHref = await getImageHref(pageContent, 'div[data-testid="photoviewer-wrapper"] figure picture img');
        if ((await pageContent.$$('time[datetime]')).length > 0) {
            article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
        }
    }
    article.bodyBlockList = await getBodyBlockList(bodyElement, 'div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2', LANG);

    return article;
}

async function parseChineseArticle(browser, url) {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});

    const title = await pageContent.$eval('.article-header header', node => node.innerText);
    article.title = await asyncTranslate(title, 'zh');
    const timeText = await pageContent.$eval('.article-header time[datetime]', node => node.getAttribute('datetime'));
    article.publishTime = new Date(timeText.replace(' ', 'T') + '+08:00');
    article.headImageHref = await getImageHref(pageContent, 'figure.article-span-photo img');

    article.bodyBlockList = await getBodyBlockList(pageContent, 'section.article-body div.article-paragraph', LANG);
    return article;
}

module.exports = {
    parseLiveNews,
    goToArticlePageAndParse,
    goToArticleArticlePageAndParse,
    parseArticle,
    parseChineseArticle,
}
