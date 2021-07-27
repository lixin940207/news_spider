const logger = require("../../config/logger");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");
const {getImageHref} = require("../utils/util");
const {ifSelectorExists} = require("../utils/util");


parseArticle = async (browser, url) =>{
    const partName = url.split(/[./]/)[2];
    if (partName === 'madame') {
        return await goToMadArticlePageAndParse(browser,url);
    } else if (partName === 'etudiant') {
        return await goToEduArticlePageAndParse(browser,url);
    } else if (partName === 'tvmag'){
        return await goToTVMagPageAndParse(browser, url);
    } else{
        return await goToArticlePageAndParse(browser,url);
    }
}

goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    if ((await pageContent.$$('article.fig-main')).length === 0) {
        console.log(url)
    }
    await pageContent.waitForSelector('article.fig-main', {timeout: 0});

    const mainElement = await pageContent.$('article.fig-main');

    if(await ifSelectorExists(mainElement, '[class*="fig-headline"]')){
        article.title.ori = await mainElement.$eval('[class*="fig-headline"]', node => node.innerText);
    }else if(await ifSelectorExists(mainElement, '[class*="fig-main-title"]')){
        article.title.ori = await mainElement.$eval('[class*="fig-main-title"]', node=>node.innerText);
    }else{
        console.log(url);
    }
    if (await ifSelectorExists(mainElement, 'p[class="fig-standfirst"]')){
        article.summary.ori = await mainElement.$eval('p[class="fig-standfirst"]', node => node.innerText);
    }
    article.imageHref = await getImageHref(mainElement, 'figure[class*="fig-media"] img');
    if (await ifSelectorExists(mainElement,"span.fig-content-metas__pub-maj-date time")) {
        article.publishTime = new Date(await mainElement.$eval('span.fig-content-metas__pub-maj-date time',
                node => node.getAttribute('datetime')));
    }else{
        article.publishTime = new Date(await mainElement.$eval('span[class*="fig-content-metas__pub-date"] time',
                node => node.getAttribute('datetime')));
    }

    article.bodyBlockList = await getBodyBlockList(mainElement, 'p.fig-paragraph, ' +
        'h2.fig-body-heading');
    return article;
}

goToTVMagPageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('article.fig-content', {timeout: 0});
    const mainElement = await pageContent.$('article.fig-content');
    article.title.ori = await mainElement.$eval('h1.fig-main-title', node => node.innerText);
    if (await ifSelectorExists(mainElement, '.fig-content__chapo')){
        article.summary.ori = await mainElement.$eval('.fig-content__chapo', node => node.innerText);
    }
    article.imageHref = await getImageHref(mainElement, 'figure[class*="fig-media"] img');
    if (await ifSelectorExists(mainElement,"span.fig-content-metas__maj-date time")) {
        article.publishTime = new Date(await mainElement.$eval('.fig-content-metas__maj-date time',
            node => node.getAttribute('datetime')));
    }else{
        article.publishTime = new Date(await mainElement.$eval('.fig-content-metas__pub-date time',
            node => node.getAttribute('datetime')));
    }

    article.bodyBlockList = await getBodyBlockList(mainElement, '.fig-content__body p');
    return article;
}

goToMadArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('.mad__article__wrapper', {timeout: 30000});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('.mad__article__wrapper');

    article.title.ori = await mainElement.$eval('.mad__titre', node => node.innerText);
    if (await ifSelectorExists(mainElement, '[class*="mad__article__chapo"]')){
        article.summary.ori = await mainElement.$eval('[class*="mad__article__chapo"]', node => node.innerText);
    }
    article.headImageHref = await getImageHref(mainElement, '.main-media img');

    return article;
}

goToEduArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
    });
    await pageContent.bringToFront();
    try {
        await pageContent.waitForSelector('article.article', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }

    const mainElement = await pageContent.$('article.article');

    article.title.ori = await mainElement.$eval('header.article__header h1', node => node.innerText);
    article.summary.ori = await mainElement.$eval('.article__content .content--chapo', node => node.innerText);
    article.headImageHref = await getImageHref(mainElement, '.article__banner img');
    // const timeText = await mainElement.$eval('header.article__header time[itemprop="dateModified"]', node => node.innerText);

    article.bodyBlockList = await getBodyBlockList(mainElement,'.article__content p:not(.content--chapo), ' +
        '.article__content figure img,' +
        '.article__content h2' +
        '.article__content blockquote');
    return article;
}

parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'domcontentloaded', timeout: 0});
    try {
        await pageLive.waitForSelector('div#live-messages', {timeout: 0});
    } catch (e) {
        logger.error(url + ' does not match the selector')
        return []
    }
    const liveElementList = await pageLive.$$('article[class*="live-message"]');
    return await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('[itemprop="headline"]', node => node.innerText)
        return {
            liveTitle: {ori: liveTitle},
            liveHref: url,
            liveTime: await element.$eval('time', node => node.getAttribute('datetime')),
            liveContent: {
                title: {ori: liveTitle},
                summary: {ori: await element.$eval('.live-article', node => node.innerHTML)}

            }
        };
    }));
}

module.exports = {
    parseArticle,
    goToArticlePageAndParse,
    goToMadArticlePageAndParse,
    goToEduArticlePageAndParse,
    parseLiveNews,
}
