const moment = require('moment-timezone');
const {processStr, getImageHref} = require("../utils/util");
const {asyncTranslate} = require("../utils/translations");
const {ifSelectorExists} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {asyncSummarize} = require("../utils/nlp_summarize");

const LANG = require('../../config/config').LANGUAGE.BBC;

const parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageLive.waitForSelector('div#lx-stream', {timeout: 0});
    let mainImageHref;
    if (await ifSelectorExists(pageLive, 'div.lx-c-session-header__image-wrapper img')) {
        mainImageHref = await getImageHref(pageLive, 'div.lx-c-session-header__image-wrapper img');
    }
    const liveElementList = await pageLive.$$('li[class*="lx-stream__post-container"] article');
    let liveNewsList = await Promise.all(liveElementList.map(async element => {
            if (!(await ifSelectorExists(element, 'header'))) return;
            let liveTitle = processStr(await element.$eval('header', node => node.innerText));
            if (liveTitle === '' || liveTitle === 'Get Involved' || liveTitle === 'Post update') return;
            if (!(await ifSelectorExists(element, 'time span.qa-post-auto-meta'))) return;

            const timeText = await element.$eval('time span.qa-post-auto-meta', node => node.innerText);
            // let m = moment.utc();
            let date = new Date();
            date.setHours(Number(timeText.split(':')[0]));
            date.setMinutes(Number(timeText.split(':')[1]));
            return {
                liveTitle: await asyncTranslate(liveTitle, LANG),
                liveHref: url,
                liveTime: date,
                liveContent: {
                    articleHref: url,
                    bodyBlockList: await getBodyBlockList(element,
                        'div.lx-stream-post-body div.lx-media-asset__image img, ' +
                        'div.lx-stream-post-body p, ' +
                        'div.lx-stream-post-body ul',
                        LANG),
                }
            }
        }
    ));
    liveNewsList = liveNewsList.filter(i => i !== undefined);
    const latestTime = new Date(Math.max.apply(null, liveNewsList.map(i => i.liveTime)))
    return {liveNewsList, latestTime, mainImageHref}
}

const parseArticle = async (browser, url) => {
    let article;
    if (url.includes('/weather/')) {
        article = await goToWeatherArticlePageAndParse(browser, url);
    } else if (url.includes('/sport/')) {
        article = await goToSportArticlePageAndParse(browser, url);
    } else if (url.includes('/av/')) {
        article = await goToVideoPageAndParse(browser, url);
    } else {
        article = await goToArticlePageAndParse(browser, url);
    }
    article.abstract = await asyncSummarize(article);
    return article;
}

const goToVideoPageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    const oriTitle = processStr(await pageContent.$eval('#main-heading', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);

    article.bodyBlockList = await getBodyBlockList(pageContent, 'article > div[class*="StyledSummary"] p', LANG);
    return article;
}

const goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    let oriTitle = ""
    if ((await pageContent.$$('#main-heading')).length > 0) {
        oriTitle = processStr(await pageContent.$eval('#main-heading', node => node.innerText));
    } else if ((await pageContent.$$('[class*="qa-story-headline"]')).length > 0) {
        oriTitle = processStr(await pageContent.$eval('h1', node => node.innerText));
    } else {
        throw Error(url + " cannot find headline.")
    }
    article.title = await asyncTranslate(oriTitle, LANG);

    article.articleHref = url;
    article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article > div[data-component="image-block"] img,' +
        'article > div[data-component="text-block"] p, ' +
        'article > div[data-component="media-block"] img, ' +
        'article > div[data-component="crosshead-block"] h2, ' +
        'article > div[data-component="subheadline-block"] h2',
        LANG);

    return article;
}

const goToSportArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    let oriTitle;
    if ((await pageContent.$$('#main-heading')).length > 0) {
        oriTitle = processStr(await pageContent.$eval('#main-heading', node => node.innerText));
    } else if ((await pageContent.$$('[class*="qa-story-headline"]')).length > 0) {
        oriTitle = processStr(await pageContent.$eval('[class*="qa-story-headline"]', node => node.innerText))
    } else {
        throw Error(url + " cannot find headline.")
    }
    article.title = await asyncTranslate(oriTitle, LANG);

    article.articleHref = url;
    // article.headImageHref = await pageContent.$eval('[class*="story-body__media"] img', node=>node.getAttribute('src'));
    article.publishTime = new Date(await pageContent.$eval('article time[datetime]', node => node.getAttribute('datetime')));
    if (await ifSelectorExists(pageContent, 'article > [class*="qa-story-body"]')) {
        article.bodyBlockList = await getBodyBlockList(pageContent,
            'article > [class*="qa-story-body"] p,' +
            'article > [class*="qa-story-body"] ul,' +
            'article > [class*="qa-story-body"] .story-body__crosshead',
            LANG);
    } else if (await ifSelectorExists(pageContent, 'article > [class*="StyledSummary"]')) {
        article.bodyBlockList = await getBodyBlockList(pageContent,
            'article > [class*="StyledSummary"] p',
            LANG);
    }
    return article;
}

const goToWeatherArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('div[class*="wr-cs-feature"]', {timeout: 30000});

    const oriTitle = processStr(await pageContent.$eval('h1[class*="wr-feature-header__title"]', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);

    article.articleHref = url;
    const timeText = await pageContent.$eval('.wr-feature-header__duration-text', node => node.innerText);
    const m = moment.utc(timeText.split(' Last updated at ')[0], "DD MMMM YYYY");
    m.set({
        hour: Number(timeText.split(' Last updated at ')[1].split(':')[0]),
        minute: Number(timeText.split(' Last updated at ')[1].split(':')[1])
    })
    article.publishTime = m.toDate();

    article.bodyBlockList = await getBodyBlockList(pageContent, 'div.wr-cs-feature__content p', LANG);
    await pageContent.close();
    return article;
}

const parseTime = async (timeText) => {
    /*
    13:24 18 Jul
     */
    let m;
    if (timeText.indexOf(' ') > -1) {
        m = moment.utc(timeText.substring(timeText.indexOf(' ') + 1), 'DD MMMM');
    } else {
        m = moment.utc();
    }
    m.set({
        hour: Number(timeText.split(/[\s:]+/)[0]),
        minute: Number(timeText.split(/[\s:]+/)[1])
    })
    return m.toDate();
}

module.exports = {
    parseLiveNews,
    parseArticle,
    parseTime,
}
