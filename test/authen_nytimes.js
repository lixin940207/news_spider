const puppeteer = require('puppeteer');
const {getBodyBlockList} = require("../services/utils/util");
// const {goToArticlePageAnxdParse} = require("../services/nytimes/common");

(async ()=>{
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const url = 'https://www.nytimes.com/live/2021/07/26/world/covid-delta-variant-vaccine'
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0
    });
    // await page.authenticate({username: 'alix.xinli@gmail.com', password: 'HappyLixin123'})

    const liveElementList = await page.$$('article div[data-test-id="live-blog-post"]');
    // const blocks = await bodyElement.$$('div[class*="StoryBodyCompanionColumn"] > div p, '+
    //     'div[class*="StoryBodyCompanionColumn"] > div h2')

    console.log( await Promise.all(liveElementList.map(async element => {
        const liveTitle = await element.$eval('[itemprop="headline"]', node => node.innerText);
        const liveHref = url + await element.$eval('[itemprop="headline"] a', node => node.getAttribute('href'));
        const liveTime = new Date(await page.$eval('time[datetime]', node=>node.getAttribute('datetime')));
        return {
            liveTitle: {ori: liveTitle},
            liveHref,
            liveTime,
            liveContent: {
                title: {ori: liveTitle},
                articleHref: liveHref,
                publishTime: liveTime,
                bodyBlockList: await getBodyBlockList(element,
                    'figure img, p'),
            }
        }
    })));
})().catch()

