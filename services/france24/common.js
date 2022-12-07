const {processStr, ifSelectorExists, getImageHref} = require("../utils/util");
const {asyncTranslate} = require("../utils/translations");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {asyncSummarize} = require("../utils/nlp_summarize");
const LANG = require('../../config/config').LANGUAGE.FRANCE24;

module.exports.goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('main article');

    const oriTitle = processStr(await pageContent.$eval('article [class*="t-content__title"]', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    const oriSummary = processStr(await pageContent.$eval('article .t-content__chapo', node => node.innerText));
    article.summary = await asyncTranslate(oriSummary, LANG);
    if (await ifSelectorExists(pageContent, 'div.t-content__main-media picture img')) {
        article.headImageHref = await getImageHref(pageContent, 'div.t-content__main-media picture img');
    }
    article.publishTime = new Date(await pageContent.$eval('article time[datetime]', node => node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article div[class*="t-content__body"] > p',
        LANG);
    article.abstract = await asyncSummarize(article);

    return article;
}
