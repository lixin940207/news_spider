const {ifSelectorExists} = require("../utils/util");
const moment = require('moment');
const logger = require("../../config/logger");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");

goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load', timeout: 0
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('article', {timeout: 30000});
    } catch (e) {
        logger.error(url + 'has problem!')
    }

    article.title.ori = await pageContent.$eval('article header [class*="title_xl"]', node => node.innerText);
    article.summary.ori = await pageContent.$eval('article header [class*="subheadline"]', node => node.innerText);

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

    article.bodyBlockList = await getBodyBlockList(pageContent,
        'article section#left [class*="article-section"] .content p' +
        'article section#left [class*="article-section"] .content h2');
    return article;
}

parseLiveNews = async (browser, url) => {
    const article = new ArticleObject();
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    try {
        await pageLive.waitForSelector('article', {timeout: 30000});
    } catch (e) {
        logger.error(url + 'has problem!')
    }
    article.articleHref = url;
    article.title.ori = await pageLive.$eval('header.article_header h1', node => node.innerText);
    article.summary.ori = await pageLive.$eval('header.article_header h2', node => node.innerText);

    const liveElementList = await pageLive.$$('article div[class*="article-section"] section.content p[class*="paragraph"]');
    const liveNewsListTemp = await Promise.all(liveElementList.map(async element => {
        let liveTitle = '';
        let summary = '';
        let date;
        if (await ifSelectorExists(element, 'b')) {
            liveTitle = (await element.$$eval('b', nodes => nodes.map(n => n.innerText))).join('');
            summary = (await element.evaluate(node => node.innerText)).split(liveTitle)[1];
            const timeText = liveTitle.split('.')[0];
            liveTitle = liveTitle.split('.')[1];
            date = new Date;
            if (timeText.includes('heure')){
                date.setHours(Number(timeText.split('heure')[0]));
                date.setMinutes(0);
            }else{
                date.setHours(Number(timeText.split('h')[0]));
                date.setMinutes(Number(timeText.split('h')[1]));
            }
        } else {
            summary = await element.evaluate(node => node.innerText);
        }
        return {
            liveTitle: {ori: liveTitle},
            liveTime: date,
            liveContent: {
                summary: {ori: summary}
            }
        }
    }));
    let liveNewsList = []
    for (let i = 0; i < liveNewsListTemp.length; i++) {
        if (liveNewsListTemp[i].liveTitle.ori === '') {
            liveNewsList[liveNewsList.length - 1].liveContent.summary.ori += liveNewsListTemp[i].liveContent.summary.ori;
        } else {
            liveNewsList.push(liveNewsListTemp[i])
        }
    }
    return [liveNewsList, article];
}

module.exports = {
    goToArticlePageAndParse,
    parseLiveNews,
}
