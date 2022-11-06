const {ArticleObject} = require("../utils/objects");
const {processStr, getBodyBlockList, ifSelectorExists} = require("../utils/util");
const {ENABLE_TRANSLATE} = require("../../config/config");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");

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
    // if (await ifSelectorExists(pageContent, 'form.consent-form')) {
    //     await acceptCookie(pageContent);
    // }

    await pageContent.waitForSelector('article.article.main-content', {timeout: 0})

    const mainElement = await pageContent.$('article.article.main-content')

    article.title.ori = processStr(await mainElement.$eval('header.article__content-header h1[data-testid="ContentHeaderHed"]', node=>node.innerText));
    article.title.cn = ENABLE_TRANSLATE? await pushToQueueAndWaitForTranslateRes(article.title.ori): "";
    article.summary.ori = await mainElement.$eval('div[data-testid="ContentHeaderAccreditation"]', node=>node.innerText);
    article.articleHref = url;
    article.publishTime = new Date(await pageContent.$eval('div[data-testid="ContentHeaderTitleBlockWrapper"] time[data-testid="ContentHeaderPublishDate"]', node=>node.innerText));

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'div.body.body__container.article__body div.body__inner-container p,' +
        // 'div.body.body__container.article__body div.body__inner-container div[aria-label="social media post"],' +
        'div.body.body__container.article__body div.body__inner-container figure.asset-embed');

    return article;
}



module.exports = {
    parseArticle,
    acceptCookie,
}
