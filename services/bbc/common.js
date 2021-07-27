const moment = require('moment-timezone');
const {ifSelectorExists} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");

parseLiveNews = async (browser, url)=>{
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageLive.waitForSelector('div#lx-stream', {timeout: 0});
    const liveElementList = await pageLive.$$('li[class*="lx-stream__post-container"] article');
    return await Promise.all(liveElementList.map(async element => {
            if (!(await ifSelectorExists(element, 'header'))) return;
            const liveTitle = await element.$eval('header', node => node.innerText);
            if (liveTitle.toString().trim() === '' || liveTitle.toString().trim() === 'Get Involved' || liveTitle.toString().trim() === 'Post update') return;
            if (!(await ifSelectorExists(element, 'time span.qa-post-auto-meta'))) return;

            const timeText = await element.$eval('time span.qa-post-auto-meta', node => node.innerText);
            let m = moment.utc();
            m.set({
                hour: Number(timeText.split(':')[0]),
                minute: Number(timeText.split(':')[1]),
            })
            return {
                liveTitle: {ori: liveTitle},
                liveHref: url,
                liveTime: m.toDate(),
                liveContent: {
                    title: {ori: liveTitle},
                    articleHref: url,
                    publishTime: m.toDate(),
                    bodyBlockList: await getBodyBlockList(element,
                        'div.lx-stream-post-body img, ' +
                        'div.lx-stream-post-body p, ' +
                        'div.lx-stream-post-body ul')
                }
            }
        }
    ));
}

parseArticle = async (browser, url)=>{
    if (url.includes('/weather/')){
        return await goToWeatherArticlePageAndParse(browser, url);
    }else if(url.includes('/sport/')){
        return await goToSportArticlePageAndParse(browser, url);
    } else{
        return await goToArticlePageAndParse(browser, url);
    }
}

goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    if ((await pageContent.$$('#main-heading')).length > 0){
        article.title.ori = await pageContent.$eval('#main-heading', node=>node.innerText);
    } else if ((await pageContent.$$('[class*="qa-story-headline"]')).length > 0) {
        article.title.ori = await pageContent.$eval('h1', node=>node.innerText)
    } else{
        throw Error(url + " cannot find headline.")
    }
    article.articleHref = url;
    article.publishTime = new Date(await pageContent.$eval('time[datetime]', node=>node.getAttribute('datetime')));

    article.bodyBlockList = await getBodyBlockList(pageContent, 'article > div[data-component="image-block"] img,' +
        'article > div[data-component="text-block"] p,' +
        'article > div[data-component="unordered-list-block"] ul,' +
        'article > div[data-component="media-block"] img,' +
        'article > div[data-component="crosshead-block"] h2')

    return article;
}

goToSportArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('article', {timeout: 0});

    if ((await pageContent.$$('#main-heading')).length > 0){
        article.title.ori = await pageContent.$eval('#main-heading', node=>node.innerText);
    } else if ((await pageContent.$$('[class*="qa-story-headline"]')).length > 0) {
        article.title.ori = await pageContent.$eval('[class*="qa-story-headline"]', node=>node.innerText)
    } else{
        throw Error(url + " cannot find headline.")
    }
    article.articleHref = url;
    // article.headImageHref = await pageContent.$eval('[class*="story-body__media"] img', node=>node.getAttribute('src'));
    article.publishTime = new Date(await pageContent.$eval('article time[datetime]', node=>node.getAttribute('datetime')));
    if (await ifSelectorExists(pageContent, 'article > [class*="qa-story-body"]')){
        article.bodyBlockList = await getBodyBlockList(pageContent, 'article > [class*="qa-story-body"] p,' +
            'article > [class*="qa-story-body"] ul,' +
            'article > [class*="qa-story-body"] .story-body__crosshead')
    } else if (await ifSelectorExists(pageContent, 'article > [class*="StyledSummary"]')){
        article.bodyBlockList = await getBodyBlockList(pageContent, 'article > [class*="StyledSummary"] p')
    }
    return article;
}

goToWeatherArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.waitForSelector('div[class*="wr-cs-feature"]', {timeout: 30000});

    article.title.ori = await pageContent.$eval('h1[class*="wr-feature-header__title"]', node=>node.innerText);

    article.articleHref = url;
    const timeText = await pageContent.$eval('.wr-feature-header__duration-text', node=>node.innerText);
    const m = moment.utc(timeText.split(' Last updated at ')[0], "DD MMMM YYYY");
    m.set({
        hour: Number(timeText.split(' Last updated at ')[1].split(':')[0]),
        minute: Number(timeText.split(' Last updated at ')[1].split(':')[1])
    })
    article.publishTime = m.toDate();

    article.bodyBlockList = await getBodyBlockList(pageContent,'div.wr-cs-feature__content p');
    return article;
}

parseTime = async (timeText)=>{
    /*
    13:24 18 Jul
     */
    let m;
    if (timeText.indexOf(' ') > -1){
        m = moment.utc(timeText.substring(timeText.indexOf(' ')+1), 'DD MMMM');
    }else{
        m = moment.utc();
    }
    m.set({
        hour: Number(timeText.split(/[\s:]+/)[0]),
        minute: Number(timeText.split(/[\s:]+/)[1])
    })
    return m.toDate();
}

module.exports = {
    parseLiveNews,
    parseArticle,
    parseTime,
}
