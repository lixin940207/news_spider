const {processStr} = require("../utils/util");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");

module.exports.goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('main article', {timeout: 0});

    article.title.ori = processStr(await pageContent.$eval('article [class*="t-content__title"]', node => node.innerText));
    article.title.cn = await pushToQueueAndWaitForTranslateRes(article.title.ori);
    article.summary.ori = processStr(await pageContent.$eval('article .t-content__chapo', node => node.innerText));
    article.summary.cn = await pushToQueueAndWaitForTranslateRes(article.summary.ori);

    article.publishTime = new Date(await pageContent.$eval('article time[datetime]', node => node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article div[class*="t-content__body"] p')
    return article;
}
