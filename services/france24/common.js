const {processStr, ifSelectorExists, getImageHref} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {ENABLE_TRANSLATE} = require("../../config/config");

module.exports.goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('main article');

    article.title.ori = processStr(await pageContent.$eval('article [class*="t-content__title"]', node => node.innerText));
    article.title.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(article.title.ori): "";
    article.summary.ori = processStr(await pageContent.$eval('article .t-content__chapo', node => node.innerText));
    article.summary.cn = ENABLE_TRANSLATE ? await pushToQueueAndWaitForTranslateRes(article.summary.ori): "";
    if (await ifSelectorExists(pageContent, 'div.t-content__main-media picture img')) {
        article.headImageHref = await getImageHref(pageContent, 'div.t-content__main-media picture img');
    }
    article.publishTime = new Date(await pageContent.$eval('article time[datetime]', node => node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article div[class*="t-content__body"] > p')
    return article;
}
