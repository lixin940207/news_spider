const moment = require('moment');
const logger = require("../../config/logger");
const {asyncTranslate} = require("../nlp_utils/translations");
const {processStr, ifSelectorExists, getImageHref} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {asyncSummarize} = require("../nlp_utils/nlp_summarize");
const LANG = require("../../config/config").LANGUAGE.LeParisien;
const URL = require('../../config/config').ORIGINAL_URLS.LeParisienURL;


const goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('article', {timeout: 0});
    } catch (e) {
        logger.error(url + 'has problem!')
    }

    const oriTitle = processStr(await pageContent.$eval('article header [class*="title_xl"]', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    const oriSummary = processStr(await pageContent.$eval('article header [class*="subheadline"]', node => node.innerText));
    article.summary = await asyncTranslate(oriSummary, LANG);
    article.headImageHref = URL + await getImageHref(pageContent, 'article div#primary_left figure img.image')
    const timeText = await pageContent.$eval('article section#left [class*="timestamp"]', node => node.innerText);
    let date = '';
    if (timeText.includes('modifié')) {
        const modifyTime = timeText.split(' le ')[1];
        date = new Date(moment(modifyTime.split(' à ')[0], 'DD MMMM YYYY', 'fr'));
        date.setHours(Number(modifyTime.split(' à ')[1].split('h')[0]));
        date.setMinutes(Number(modifyTime.split(' à ')[1].split('h')[1]));
    } else {
        const publishTime = timeText.split('Le ')[1];
        date = new Date(moment(publishTime.split(' à ')[0], 'DD MMMM YYYY', 'fr'));
        date.setHours(Number(publishTime.split(' à ')[1].split('h')[0]));
        date.setMinutes(Number(publishTime.split(' à ')[1].split('h')[1]));
    }
    article.publishTime = date;
    if (await ifSelectorExists(pageContent, 'div#primary_left figure img')) {
        article.headImageHref = URL + await pageContent.$eval('div#primary_left figure img', node => node.getAttribute('src'));
    }
    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article section#left [class*="article-section"] .content > p,' +
        'article section#left [class*="article-section"] .content > h2,' +
        'article section#left [class*="article-section"] .content .essential-card_container_element *',
        LANG);
    article.abstract = await asyncSummarize(article, LANG);

    return article;
}

const parseLiveNews = async (browser, url) => {
    const article = new ArticleObject();
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    try {
        await pageLive.waitForSelector('div.pageContent article', {timeout: 0});
    } catch (e) {
        logger.error(url + 'has problem!')
    }
    article.articleHref = url;
    const oriTitle = processStr(await pageLive.$eval('header.article_header h1', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    const oriSummary = processStr(await pageLive.$eval('header.article_header h2', node => node.innerText));
    article.summary = await asyncTranslate(oriSummary, LANG);

    const liveElementDate = await pageLive.$$('article div[class*="article-section"] section.content div.card-date');
    const liveElementText = await pageLive.$$('article div[class*="article-section"] section.content div.standard-card_container');
    if (liveElementDate.length !== liveElementText.length) {
        console.log('hahahahha');
    }
    const liveElementDateTemp = await Promise.all(liveElementDate.map(async element => {
        const timeText = await element.evaluate(node => node.innerText);
        const date = new Date();
        if (timeText === 'Midi') {
            date.setHours(12);
            date.setMinutes(0);
        } else if (timeText.includes('heure')) {
            date.setHours(Number(timeText.split('heure')[0]));
            date.setMinutes(0);
        } else {
            date.setHours(Number(timeText.split(':')[0]));
            date.setMinutes(Number(timeText.split(':')[1]));
        }
        return date;
    }));

    const liveNewsList = await Promise.all(liveElementText.map(async (element, i) => {
        let liveTitle = '';
        try {
            liveTitle = await element.$eval('div.standard-card_container_element h2', n => n.innerText);
        } catch (e) {
            liveTitle = '';
        }
        const summary = await getBodyBlockList(element, 'div.standard-card_container_element p,' +
            'div.standard-card_container_element ul', LANG);
        return {
            liveTitle: await asyncTranslate(liveTitle, LANG),
            liveTime: liveElementDateTemp[i] === undefined ? new Date() : liveElementDateTemp[i],
            liveContent: {
                bodyBlockList: summary,
            }
        }
    }))
    let latestTime = Math.max.apply(null, liveNewsList.map(i => i.liveTime));
    if (latestTime == null) {
        latestTime = new Date();
    } else {
        latestTime = new Date(latestTime);
    }
    // const latestTime = new Date();

    return {liveNewsList, article, latestTime};
}

module.exports = {
    goToArticlePageAndParse,
    parseLiveNews,
}
