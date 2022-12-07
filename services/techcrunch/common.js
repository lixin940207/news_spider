const {ArticleObject} = require("../utils/objects");
const {processStr, getBodyBlockList, ifSelectorExists} = require("../utils/util");
const {asyncTranslate} = require("../utils/translations");
const {asyncSummarize} = require("../utils/nlp_summarize");
const LANG = require("../../config/config").LANGUAGE.TechCrunch;

acceptCookie = async (page) => {
    await Promise.all([
        page.waitForNavigation(), // The promise resolves after navigation has finished
        page.click('button.btn.secondary.accept-all.consent_reject_all_2'), // Clicking the link will indirectly cause a navigation
    ]);
    // await page.waitForNavigation();
    // await page.click('button.btn.secondary.accept-all.consent_reject_all_2');
}

parseArticle = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    if (await ifSelectorExists(pageContent, 'form.consent-form')) {
        await acceptCookie(pageContent);
    }

    await pageContent.waitForSelector('div#tc-main-content div.content div.river article.article-container.article--post', {timeout: 0})

    const mainElement = await pageContent.$('div#tc-main-content div.content div.river article.article-container.article--post')

    const oriTitle = processStr(await mainElement.$eval('div.article__content-wrap header.article__header div.article__title-wrapper', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    article.articleHref = url;
    article.publishTime = new Date(await pageContent.$eval('div.article__content-wrap header.article__header div.article__byline-wrapper time', node => node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'div.article__content-wrap div.article-content > div.embed.breakout,' +
        'div.article__content-wrap div.article-content > p,' +
        'div.article__content-wrap div.article-content > h2,' +
        'div.article__content-wrap div.article-content > ul',
        LANG);

    article.abstract = await asyncSummarize(article);

    return article;
}


module.exports = {
    parseArticle,
    acceptCookie,
}
