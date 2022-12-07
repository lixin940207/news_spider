const moment = require('moment');
const logger = require("../../config/logger");
const {asyncTranslate} = require("../utils/translations");
const {processStr, getBodyBlockList, ifSelectorExists} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {asyncSummarize} = require("../utils/nlp_summarize");

const LANG = require('../../config/config').LANGUAGE.BFM;

goToDetailPageAndParse = async (browser, url) => {
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    if (!(await ifSelectorExists(pageContent, '#main_wrapper'))) {
        console.log(url);
        return null;
    }
    let article;
    if ((await pageContent.$eval('#main_wrapper', node => node.getAttribute('class'))).includes('video')) {
        return null;
    } else {
        article = await goToArticlePageAndParse(pageContent, url);
    }
    article.abstract = await asyncSummarize(article);
    return article;
}

goToArticlePageAndParse = async (pageContent) => {
    const article = new ArticleObject();

    const oriTitle = processStr(await pageContent.$eval('#contain_title', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);

    if (await ifSelectorExists(pageContent, '.content_body_wrapper .chapo')) {
        const oriSummary = processStr(await pageContent.$eval('.content_body_wrapper .chapo', node => node.innerText));
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    const timeText = await pageContent.$eval('header #signatures_date time', node => node.innerText);
    const date = new Date(moment(timeText.split(' à ')[0], 'DD/MM/YYYY', 'fr'));
    date.setHours(Number(timeText.split(' à ')[1].split(':')[0]));
    date.setMinutes(Number(timeText.split(' à ')[1].split(':')[1]));
    article.publishTime = date;

    article.bodyBlockList = await getBodyBlockList(pageContent, 'article .content_body_wrapper p,' + 'article .content_body_wrapper blockquote,' + 'article .content_body_wrapper h2.subheading', LANG);
    return article;
}


goToVideoPageAndParse = async (pageContent) => {
    const article = new ArticleObject();

    const oriTitle = processStr(await pageContent.$eval('#contain_title', node => node.innerText));
    article.title = await asyncTranslate(oriTitle, LANG);
    if (await ifSelectorExists(pageContent, '#content_description')) {
        const oriSummary = await pageContent.$eval('#content_description', node => node.innerText);
        article.summary = await asyncTranslate(oriSummary, LANG);
    }
    const timeText = await pageContent.$eval('#content_scroll_start time', node => node.innerText);
    const date = new Date(moment(timeText.split(' à ')[0], 'DD/MM/YYYY', 'fr'));
    date.setHours(Number(timeText.split(' à ')[1].split(':')[0]));
    date.setMinutes(Number(timeText.split(' à ')[1].split(':')[1]));
    article.publishTime = date;
    return article;
}

parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    try {
        await pageLive.waitForSelector('article', {timeout: 0});
    } catch (e) {
        logger.error(url + ' has problem!')
    }
    const liveElementList = await pageLive.$$('div.content_live_block[id^="article_"]');
    const liveNewsList = await Promise.all(liveElementList.map(async element => {
        let liveTitle;
        let date;
        let timeText;
        if (await ifSelectorExists(element, '.live_block_title')) {
            liveTitle = processStr(await element.$eval('.live_block_title', node => node.innerText));
            timeText = await element.$eval('.content_live_datetime time', node => node.innerText)

        } else if (await ifSelectorExists(element, '.content_post .subheading')) {
            liveTitle = processStr(await element.$eval('.content_post .subheading', node => node.innerText));
            timeText = await element.$eval('span[class="action_minutes post_date"]', node => node.innerText)
        }

        if (timeText.includes(' à ')) {
            date = new Date(moment(timeText.split(' à ')[0], "DD/MM"));
            date.setHours(Number(timeText.split(' à ')[1].split(':')[0]));
            date.setMinutes(Number(timeText.split(' à ')[1].split(':')[1]));
        } else {
            date = new Date();
            date.setHours(Number(timeText.split(':')[0]));
            date.setMinutes(Number(timeText.split(':')[1]));
        }
        return {
            liveTitle: await asyncTranslate(liveTitle, LANG),
            liveTime: date,
            liveContent: {
                bodyBlockList: await getBodyBlockList(element, '.content_post p, .content_post blockquote', LANG)
            }
        }
    }));
    const latestTime = new Date(Math.max.apply(null, liveNewsList.map(i => i.liveTime)));
    return {liveNewsList, latestTime}
}

module.exports = {
    parseLiveNews, goToDetailPageAndParse,
}
