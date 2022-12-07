const moment = require("moment");
const {asyncTranslate} = require("../utils/translations");
const {processStr} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList, ifSelectorExists} = require("../utils/util");
const {asyncSummarize} = require("../utils/nlp_summarize");
const LANG = require("../../config/config").LANGUAGE.LeMonde;

module.exports.goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('main');

    if (url.split('/')[3] === 'blog') {
        const oriTitle = processStr(await pageContent.$eval('main#main .entry-title', node => node.innerText));
        article.title = await asyncTranslate(oriTitle, LANG);
        article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
        article.bodyBlockList = await getBodyBlockList(pageContent, '.entry-content img,' +
            '.entry-content p',
            LANG);
        return article;
    } else if (url.split('/')[4] === 'visuel') {
        const oriTitle = processStr(await pageContent.$eval('div.intro', node => node.innerText));
        article.title = await asyncTranslate(oriTitle, LANG);
        article.bodyBlockList = await getBodyBlockList(pageContent, 'div.chapo p', LANG);
    } else {
        let dateHeader;
        if (await ifSelectorExists(pageContent, 'article#Longform')) {
            const oriTitle = processStr(await pageContent.$eval('article#Longform .article__heading h1', node => node.innerText));
            article.title = await asyncTranslate(oriTitle, LANG);
            const oriSummary = processStr(await pageContent.$eval('article#Longform .article__heading .article__info .article__desc', node => node.innerText));
            article.summary = await asyncTranslate(oriSummary, LANG);
            dateHeader = await pageContent.$eval('article#Longform .article__heading .meta__publisher', node => node.innerText);
            article.bodyBlockList = await getBodyBlockList(pageContent,
                'article#Longform section.article__content p.article__paragraph, ' +
                'article#Longform section.article__content [class*="article__sub-title"], ' +
                'article#Longform section.article__content blockquote,' +
                'article#Longform section.article__content figure img',
                LANG)
        } else {
            const oriTitle = processStr(await pageContent.$eval('header[class*="article__header"] .article__title', node => node.innerText));
            article.title = await asyncTranslate(oriTitle, LANG);
            const oriSummary = processStr(await pageContent.$eval('header[class*="article__header"] .article__desc', node => node.innerText));
            article.summary = await asyncTranslate(oriSummary, LANG);
            dateHeader = await pageContent.$eval('header[class*="article__header"] span[class*="meta__date"]', node => node.innerText);

            article.bodyBlockList = await getBodyBlockList(pageContent,
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__paragraph"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__sub-title"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] blockquote,' +
                'section[class*="article__wrapper"] article[class*="article__content"] figure.article__media img',
                LANG);
        }
        let date;
        if (dateHeader.includes("aujourd’hui") || dateHeader.includes("mis à jour à")) {
            const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
            date = new Date();
            date.setHours(Number(currentTime.split('h')[0]))
            date.setMinutes(Number(currentTime.split('h')[1]))
        } else if (new RegExp(/(\shier\sà\s)\d{1,2}h\d{1,2}$/).test(dateHeader)) {
            const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
            date = new Date();
            date.setDate(date.getDate() - 1);
            date.setHours(Number(currentTime.split('h')[0]));
            date.setMinutes(Number(currentTime.split('h')[1]));
        } else {
            const timeText = dateHeader.split(' le ')[dateHeader.split(' le ').length - 1];
            if (timeText.includes(' à ')) {
                date = new Date(moment(timeText.split(' à ')[0], 'DD MMMM YYYY', 'fr'));
                date.setHours(Number(timeText.split(' à ')[1].split('h')[0]))
                date.setMinutes(Number(timeText.split(' à ')[1].split('h')[1]))
            } else {
                date = new Date(moment(timeText, 'DD MMMM YYYY', 'fr'));
            }
        }
        article.publishTime = date;
        article.abstract = await asyncSummarize(article);
        return article;
    }
}


module.exports.parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load'});
    await pageLive.waitForSelector('section.post__live-section.post-container');
    const liveElementList = await pageLive.$$('section.post__live-section.post-container > section.post.post__live-container');
    let liveNewsList = await Promise.all(liveElementList.map(async element => {
        let liveTitle = '';
        if (!(await ifSelectorExists(element, '[class*="post__live-container--title"]'))) {
            return;
        }
        liveTitle = processStr(await element.$eval('[class*="post__live-container--title"]', async node => node.innerText));
        if (await ifSelectorExists(element, '.header-content__live .flag-live__border__label')) {
            liveTitle = processStr(await element.$eval('.header-content__live .flag-live__border__label', node => node.innerText)) + ' - ' + liveTitle;
        }
        const timeText = await element.$eval('span.date', node => node.innerText);
        let liveTime = new Date();
        liveTime.setHours(Number(timeText.split(':')[0]));
        liveTime.setMinutes(Number(timeText.split(':')[1]));
        return {
            liveTitle: await asyncTranslate(liveTitle, LANG),
            liveHref: url,
            liveTime,
            liveContent: {
                bodyBlockList: await getBodyBlockList(element,
                    '.content--live .post__live-container--answer-content p,' +
                    '.content--live figure.post__live-container--figure img',
                    LANG),
            }
        };
    }));
    liveNewsList = liveNewsList.filter(i => i !== undefined);
    const latestTime = new Date(Math.max.apply(null, liveNewsList.map(i => i.liveTime)));
    return {liveNewsList, latestTime}
}


