const {ArticleObject} = require("../utils/objects");
const {processStr, getBodyBlockList} = require("../utils/util");
const {asyncTranslate} = require("../nlp_utils/translations");
const {asyncSummarize} = require("../nlp_utils/nlp_summarize");
const LANG = require("../../config/config").LANGUAGE.WIRED;

acceptCookie = async (page) => {
    await Promise.all([
        page.waitForNavigation(), // The promise resolves after navigation has finished
        page.click('button.btn.secondary.accept-all.consent_reject_all_2'), // Clicking the link will indirectly cause a navigation
    ]);
}

parseArticle = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });

    await pageContent.waitForSelector('article.article.main-content', {timeout: 0})

    const mainElement = await pageContent.$('article.article.main-content')

    const oriTitle = processStr(await mainElement.$eval('header.article__content-header h1[data-testid="ContentHeaderHed"]', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    const oriSummary = await mainElement.$eval('div[data-testid="ContentHeaderAccreditation"]', node => node.innerText);
    article.summary = await asyncTranslate(oriSummary, LANG);
    article.articleHref = url;
    article.publishTime = new Date(await pageContent.$eval('div[data-testid="ContentHeaderTitleBlockWrapper"] time[data-testid="ContentHeaderPublishDate"]', node => node.innerText));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'div.grid-layout__content div.body.body__container.article__body div.body__inner-container p,' +
        'div.grid-layout__content div.body.body__container.article__body div.body__inner-container figure.asset-embed picture img',
        LANG);
    article.bodyBlockList = article.bodyBlockList.filter(block => block.en !== 'FEATURED VIDEO' || block.en !== '');
    article.abstract = await asyncSummarize(article);
    return article;
}

module.exports = {
    parseArticle,
    acceptCookie,
}
