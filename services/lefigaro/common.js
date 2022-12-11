const logger = require("../../config/logger");
const {asyncTranslate} = require("../nlp_utils/translations");
const {processStr} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");
const {asyncSummarize} = require("../nlp_utils/nlp_summarize");
const LANG = require("../../config/config").LANGUAGE.LeFigaro;

const parseArticle = async (browser, url) => {
    const partName = url.split(/[./]/)[2];
    let article;
    if (partName === 'madame') {
        article = await goToMadArticlePageAndParse(browser, url);
    } else if (partName === 'etudiant') {
        article = await goToEduArticlePageAndParse(browser, url);
    } else if (partName === 'tvmag') {
        article = await goToTVMagPageAndParse(browser, url);
    } else {
        article = await goToArticlePageAndParse(browser, url);
    }
    article.abstract = await asyncSummarize(article, LANG);
    return article;
}

const goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    if ((await pageContent.$$('article.fig-main')).length === 0) {
        console.log(url);
    }
    try {
        await pageContent.waitForSelector('article.fig-main', {timeout: 0});
    } catch (e) {
        logger.error(url + ' has problem!')
    }
    const mainElement = await pageContent.$('article.fig-main');

    let oriTitle;
    if (await ifSelectorExists(mainElement, '[class*="fig-headline"]')) {
        oriTitle = processStr(await mainElement.$eval('[class*="fig-headline"]', node => node.innerText));
    } else if (await ifSelectorExists(mainElement, '[class*="fig-main-title"]')) {
        oriTitle = processStr(await mainElement.$eval('[class*="fig-main-title"]', node => node.innerText));
    } else {
        console.log(url);
        return;
    }
    article.title = await asyncTranslate(oriTitle, LANG);
    if (await ifSelectorExists(mainElement, 'p[class="fig-standfirst"]')) {
        const oriSummary = processStr(await mainElement.$eval('p[class="fig-standfirst"]', node => node.innerText));
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    article.imageHref = await getImageHref(mainElement, 'figure[class*="fig-media"] img');
    if (await ifSelectorExists(mainElement, "span.fig-content-metas__pub-maj-date time")) {
        article.publishTime = new Date(await mainElement.$eval('span.fig-content-metas__pub-maj-date time',
            node => node.getAttribute('datetime')));
    } else {
        article.publishTime = new Date(await mainElement.$eval('span[class*="fig-content-metas__pub-date"] time',
            node => node.getAttribute('datetime')));
    }
    article.bodyBlockList = await getBodyBlockList(mainElement, 'p.fig-paragraph, ' +
        'h2.fig-body-heading',
        LANG);
    return article;
}

const goToTVMagPageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article.fig-content', {timeout: 0});
    const mainElement = await pageContent.$('article.fig-content');
    const oriTitle = processStr(await mainElement.$eval('h1.fig-main-title', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    if (await ifSelectorExists(mainElement, '.fig-content__chapo')) {
        const oriSummary = processStr(await mainElement.$eval('.fig-content__chapo', node => node.innerText));
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    article.imageHref = await getImageHref(mainElement, 'figure[class*="fig-media"] img');
    if (await ifSelectorExists(mainElement, "span.fig-content-metas__maj-date time")) {
        article.publishTime = new Date(await mainElement.$eval('.fig-content-metas__maj-date time',
            node => node.getAttribute('datetime')));
    } else {
        article.publishTime = new Date(await mainElement.$eval('.fig-content-metas__pub-date time',
            node => node.getAttribute('datetime')));
    }
    article.bodyBlockList = await getBodyBlockList(mainElement, '.fig-content__body p', LANG);
    return article;
}

const goToMadArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('.fig-main-wrapper', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('.fig-main-wrapper');

    const oriTitle = processStr(await mainElement.$eval('.fig-headline', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    if (await ifSelectorExists(mainElement, '.fig-standfirst')) {
        const oriSummary = processStr(await mainElement.$eval('.fig-standfirst', node => node.innerText));
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    article.headImageHref = await mainElement.$eval('div.fig-media__container', node => node.getAttribute('data-modal-image-url'));
    article.bodyBlockList = await getBodyBlockList(mainElement, '.fig-content-body p, .fig-content-body h2', LANG);
    return article;
}

const goToEduArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('article.article', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('article.article');

    const oriTitle = processStr(await mainElement.$eval('header.article__header h1', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    const oriSummary = processStr(await mainElement.$eval('.article__content .content--chapo', node => node.innerText));
    article.summary = await asyncTranslate(oriSummary, LANG);
    article.headImageHref = await getImageHref(mainElement, '.article__banner img');

    article.bodyBlockList = await getBodyBlockList(mainElement,
        '.article__content p:not(.content--chapo), ' +
        '.article__content figure img,' +
        '.article__content h2' +
        '.article__content blockquote',
        LANG);
    return article;
}

const parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try {
        await pageLive.waitForSelector('div#live-messages', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }
    const liveElementList = await pageLive.$$('article[class*="live-message"]');
    const liveNewsList = await Promise.all(liveElementList.map(async element => {
        const liveTitle = processStr(await element.$eval('[itemprop="headline"]', node => node.innerText));
        const content = await element.$eval('.live-article', node => node.innerText);
        const bodyBlockList = await Promise.all(content.split('\n').map(i => i.trim()).filter(i => i !== "").map(async i => {
            return {
                type: "p",
                ...(await asyncTranslate(i, LANG)),
            }
        }))
        return {
            liveTitle: await asyncTranslate(liveTitle, LANG),
            liveHref: url,
            liveTime: new Date(await element.$eval('time', node => node.getAttribute('datetime'))),
            liveContent: {
                bodyBlockList
            }
        };
    }));
    const latestTime = new Date(Math.max.apply(null, liveNewsList.map(i => i.liveTime)));
    return {liveNewsList, latestTime}
}

module.exports = {
    parseArticle,
    goToArticlePageAndParse,
    goToMadArticlePageAndParse,
    goToEduArticlePageAndParse,
    parseLiveNews,
}
