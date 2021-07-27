const logger = require("../../config/logger");
const {ifSelectorExists} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const BASE_URL = "https://www.nytimes.com/";


parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try{
        await pageLive.waitForSelector('article', {timeout: 0});
    }catch (e) {
        logger.error(url+'has problem!')
    }
    const liveTime = new Date(await pageLive.$eval('time[datetime]', node=>node.getAttribute('datetime')));
    const liveElementList = await pageLive.$$('article div[data-test-id="live-blog-post"]');
    return {
        publishTime: liveTime,
        liveNewsList: await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('[itemprop="headline"]', node => node.innerText);
        const liveHref = url + await element.$eval('[itemprop="headline"] a', node => node.getAttribute('href'));
        return {
            liveTitle: {ori: liveTitle},
            liveHref,
            liveContent: {
                title: {ori: liveTitle},
                articleHref: liveHref,
                publishTime: liveTime,
                bodyBlockList: await getBodyBlockList(element,
                    'figure img, p'),
            }
        }
    }))};
}

parseArticle = async (browser, url)=>{
    if (url.split(BASE_URL)[1].startsWith('/article/')) {
        return await goToArticleArticlePageAndParse(browser, url);
    } else {
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
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});
    const bodyElement = await pageContent.$('article section[name="articleBody"]');
    if(!(await ifSelectorExists(pageContent, 'h1[data-testid="headline"]'))){
        console.log(url);
    }
    article.title.ori = await pageContent.$eval('h1[data-testid="headline"]', node => node.innerText);
    if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
        article.summary.ori = await pageContent.$eval('p[id="article-summary"]', node => node.innerText);
    }
    article.headImageHref = await getImageHref(pageContent, 'div[data-testid="photoviewer-wrapper"] figure picture img');
    if ((await pageContent.$$('time[datetime]')).length > 0) {
        article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
    }
    article.bodyBlockList = await getBodyBlockList(bodyElement,'div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2');

    if (await ifSelectorExists(pageContent, 'article header a[data-version="zh-hans"]')){
        const ChineseUrl = await pageContent.$eval('article header a[data-version="zh-hans"]', node=>node.getAttribute('href'));
        const chineseArticle = await parseChineseArticle(browser, ChineseUrl);
        article.title.cn = chineseArticle.title.cn;
        article.summary.cn = chineseArticle.summary.cn;
        article.bodyBlockList = article.bodyBlockList.map((item, i)=>{
                if (['p', 'h2', 'blockquote', 'ul'].includes(i.type)){
                    item.cn = chineseArticle.bodyBlockList[i].cn
                }
            }
        )
    }
    return article;
}

goToArticleArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article#story', {timeout: 0});
    // console.log('parsed ' + url)
    const headerElement = await pageContent.$('article#story header');
    const bodyElement = await pageContent.$('article#story section[name="articleBody"]');

    if (headerElement !== null){
        if ((await headerElement.$$('h1')).length === 0){
            console.log(url)
            console.log(await headerElement.evaluate(node=>node.outerHTML))
        }
        article.title.ori = await headerElement.$eval('h1', node => node.innerText);
        if ((await headerElement.$$('p[id="article-summary"]')).length > 0) {
            article.summary.ori = await headerElement.$eval('p[id="article-summary"]', node => node.innerText);
        }
        article.headImageHref = await getImageHref(headerElement, 'div[data-testid="photoviewer-wrapper"] figure picture img');
        if ((await headerElement.$$('time[datetime]')).length > 0) {
            article.publishTime = new Date(await headerElement.$eval('time[datetime]', node => node.getAttribute('datetime')));
        }
    } else{
        article.title.ori = await pageContent.$eval('h1', node => node.innerText);
        if ((await pageContent.$$('p[id="article-summary"]')).length > 0) {
            article.summary.ori = await pageContent.$eval('p[id="article-summary"]', node => node.innerText);
        }
        article.headImageHref = await getImageHref(pageContent, 'div[data-testid="photoviewer-wrapper"] figure picture img');
        if ((await pageContent.$$('time[datetime]')).length > 0) {
            article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
        }
    }

    article.bodyBlockList = await getBodyBlockList(bodyElement, 'div[class*="StoryBodyCompanionColumn"] > div p, ' +
        'div[class*="StoryBodyCompanionColumn"] > div h2');

    return article;
}

async function parseChineseArticle(browser, url){
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article', {timeout: 0});

    const title = await pageContent.$eval('.article-header header', node => node.innerText);
    article.title = {ori: title, cn: title}
    const timeText = await pageContent.$eval('.article-header time[datetime]', node => node.getAttribute('datetime'));
    article.publishTime = new Date(timeText.replace(' ','T')+'+08:00');
    article.headImageHref = await getImageHref(pageContent,'figure.article-span-photo img');

    const bodyBlockList = await getBodyBlockList(pageContent,'section.article-body div.article-paragraph');
    article.bodyBlockList = bodyBlockList.map(i=>{
        if (['p', 'h2', 'blockquote', 'ul'].includes(i.type)){
            i.cn = i.ori
        }
    })
    return article;
}

module.exports = {
    parseLiveNews,
    goToArticlePageAndParse,
    goToArticleArticlePageAndParse,
    parseArticle,
    parseChineseArticle,
}
