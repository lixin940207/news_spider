const {ifSelectorExists} = require("../utils/util");
const moment = require("moment");
const {pushToQueueAndWaitForTranslateRes} = require("../utils/translations");
const {processStr} = require("../utils/util");
const {ArticleObject} = require("../utils/objects");
const {getBodyBlockList} = require("../utils/util");

module.exports.goToArticlePageAndParse = async (browser, url) => {
    const article = new ArticleObject();
    const pageContent = await browser.newPage();
    await pageContent.goto(url, {
        waitUntil: 'load',
        timeout: 0
    });
    await pageContent.bringToFront();
    await pageContent.waitForSelector('main', {timeout: 0});

    if (url.split('/')[3] === 'blog'){
        article.title.ori = processStr(await pageContent.$eval('main#main .entry-title', node => node.innerText));
        article.title.cn = await pushToQueueAndWaitForTranslateRes(article.title.ori);
        article.publishTime = new Date(await pageContent.$eval('time[datetime]', node => node.getAttribute('datetime')));
        article.bodyBlockList = await getBodyBlockList(pageContent,'.entry-content img,' +
            '.entry-content p');
        return article;
    }else {
        let dateHeader;
        if (await ifSelectorExists(pageContent, 'article#Longform')){
            article.title.ori = processStr(await pageContent.$eval('article#Longform .article__heading h1', node => node.innerText));
            article.title.cn = await pushToQueueAndWaitForTranslateRes(article.title.ori);
            article.summary.ori = processStr(await pageContent.$eval('article#Longform .article__heading .article__info .article__desc', node => node.innerText));
            article.summary.cn = await pushToQueueAndWaitForTranslateRes(article.summary.ori);
            dateHeader = await pageContent.$eval('article#Longform .article__heading .meta__publisher', node => node.innerText);
            article.bodyBlockList = await getBodyBlockList(pageContent,
                'article#longform .article__content [class*="article__paragraph"], ' +
                'article#longform .article__content [class*="article__sub-title"], ' +
                'article#longform .article__content blockquote,' +
                'article#longform .article__content figure img')
        }else{
            article.title.ori = processStr(await pageContent.$eval('header[class*="article__header"] .article__title', node => node.innerText));
            article.title.cn = await pushToQueueAndWaitForTranslateRes(article.title.ori);
            article.summary.ori = processStr(await pageContent.$eval('header[class*="article__header"] .article__desc', node => node.innerText));
            article.summary.cn = await pushToQueueAndWaitForTranslateRes(article.summary.ori);
            dateHeader = await pageContent.$eval('header[class*="article__header"] span[class*="meta__date"]', node => node.innerText);

            article.bodyBlockList = await getBodyBlockList(pageContent,
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__paragraph"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] [class*="article__sub-title"], ' +
                'section[class*="article__wrapper"] article[class*="article__content"] blockquote');
        }
        let date;
            if (dateHeader.includes("aujourd???hui") || dateHeader.includes("mis ?? jour ??")) {
                const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
                date = new Date();
                date.setHours(Number(currentTime.split('h')[0]))
                date.setMinutes(Number(currentTime.split('h')[1]))
            }else if(new RegExp(/(\shier\s??\s)\d{1,2}h\d{1,2}$/).test(dateHeader)){
                const currentTime = dateHeader.split(' ')[dateHeader.split(' ').length - 1];
                date = new Date();
                date.setDate(date.getDate() - 1);
                date.setHours(Number(currentTime.split('h')[0]));
                date.setMinutes(Number(currentTime.split('h')[1]));
            }else{
                const timeText = dateHeader.split(' le ')[dateHeader.split(' le ').length - 1];
                if(timeText.includes(' ?? ')){
                    date = new Date(moment(timeText.split(' ?? ')[0], 'DD MMMM YYYY', 'fr'));
                    date.setHours(Number(timeText.split(' ?? ')[1].split('h')[0]))
                    date.setMinutes(Number(timeText.split(' ?? ')[1].split('h')[1]))
                }else{
                    date = new Date(moment(timeText, 'DD MMMM YYYY', 'fr'));
                }
            }
        article.publishTime = date;
        return article;
    }
}


module.exports.parseLiveNews = async (browser, url) => {
    const pageLive = await browser.newPage();
    await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
    await pageLive.waitForSelector('section[class*="sirius-live"]', {timeout: 0});
    const liveElementList = await pageLive.$$('section#post-container > section.post.post__live-container');
    let liveNewsList =  await Promise.all(liveElementList.map(async element => {
        let liveTitle = '';
        if (!(await ifSelectorExists(element,'[class*="post__live-container--title"]'))) {
            return;
        }
        liveTitle = processStr(await element.$eval('[class*="post__live-container--title"]', async node => node.innerText));
        if(await ifSelectorExists(element, '.header-content__live .flag-live__border__label')){
            liveTitle = processStr(await element.$eval('.header-content__live .flag-live__border__label', node=>node.innerText)) +' - ' + liveTitle;
        }
        const timeText = await element.$eval('span.date', node => node.innerText);
        let liveTime = new Date();
        liveTime.setHours(Number(timeText.split(':')[0]));
        liveTime.setMinutes(Number(timeText.split(':')[1]));
        return {
            liveTitle: {ori: liveTitle, cn:await pushToQueueAndWaitForTranslateRes(liveTitle)},
            liveHref: url,
            liveTime,
            liveContent: {
                bodyBlockList: await getBodyBlockList(element,'.content--live .post__live-container--answer-content p,' +
                    '.content--live figure.post__live-container--figure img'),
            }
        };
    }));
    liveNewsList = liveNewsList.filter(i=>i!==undefined);
    const latestTime = new Date(Math.max.apply(null,liveNewsList.map(i=>i.liveTime)));
    return {liveNewsList, latestTime}
}


