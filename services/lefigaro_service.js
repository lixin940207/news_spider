const LeFigaroNews = require('../models/lefigaro');
const puppeteer = require('puppeteer');
const NewsTypes = require("../models/news_type_enum");
const URL = require('../config/config').ORIGINAL_URLS.LeFigaroURL;

class LeFigaroCrawler {

    main = async () => {
        this.browser = await puppeteer.launch();
        const page = await this.browser.newPage();
        await page.goto(URL, {
            // waitUntil: 'load',
            timeout: 0
        });
        console.log('got to the page.')
        await page.waitForSelector('section.fig-main', {timeout: 0})
        console.log('loaded')
        const elementList = await page.$$('section[class*="fig_ensemble"], article[class*="fig-profile"]')

        let promises = [];
        for (let i = 0; i < elementList.length; i++) {
            let p = async () => {
                let news;
                let elementClassName = await elementList[i].evaluate(node => {
                    return node.getAttribute('class')
                })
                if (elementClassName.includes('fig_ensemble')) {
                    news = await this.parseEnsembleNews(elementList[i], i);
                } else if (elementClassName.includes('fig-profile--live')){
                    news = await this.parseProfileOrLiveNews(elementList[i], i, NewsTypes.CardWithImageAndLive);
                } else{
                    news = await this.parseProfileOrLiveNews(elementList[i], i, NewsTypes.CardWithImage);
                }
            };
            promises.push(p)
        }
        await Promise.all(promises);
    }

    parseEnsembleNews = async (element, idx) => {
        let news = {
            ranking: idx,
            newsType: NewsTypes.CardWithImageAndSubtitle
        };
        news.title = await element.$eval('[class*="fig-ensemble__title"]', node => node.innerText);
        news.articleHref = await element.$eval('a[class="fig-ensemble__first-article-link"]')
        news.imageHref = await element.$eval('img', node => node.getAttribute('srcset').split(' ')[0])
        news.summary = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
        news.relatedNewsList = await element.$$eval('ul li a', nodes => nodes.map(n => {
                return {relatedTitle: n.innerText, relatedHref: n.getAttribute('href')}
            })
        );
        news.article = await this.goToArticlePageAndParse(news.articleHref);
        return await LeFigaroNews.upsertNews(news);
    }

    parseProfileOrLiveNews = async (element, idx, isLive) => {
        let news = {
            ranking: idx,
            newsType: isLive?NewsTypes.CardWithImageAndLive:NewsTypes.CardWithImage,
        }
        news.title = await element.$eval('[class*="fig-profile__headline"]', node => node.innerText);
        news.articleHref = await element.$eval('a[class="fig-profile__link"]');
        news.imageHref = await element.$eval('img', node => node.getAttribute('srcset').split(' ')[0])
        news.summary = await element.$eval('p[class*="fig-ensemble__chapo"]', node => node.innerText);
        if (isLive){
            news.liveNewsList = await this.parseLiveNews(news.articleHref);
        }else{
            news.article = await this.goToArticlePageAndParse(news.articleHref);
        }

        return await LeFigaroNews.upsertNews(news);
    }

    goToArticlePageAndParse = async (url)=>{
        let article = {};
        const pageContent = await this.browser.newPage();
        await pageContent.goto(url, {
            waitUntil: 'load', timeout: 0
        });
        await pageContent.bringToFront();
        await pageContent.waitForSelector('article#fig-main', {timeout: 0});

        const mainElement = await pageContent.$('article#fig-main');

        article.title = await mainElement.$eval('[class*="fig-headline"]', node => node.innerText);
        article.summary = await mainElement.$eval('p[class="fig-standfirst"]', node => node.innerText);
        article.headImageHref = await mainElement.$eval('figure[class*="fig-media"] img', node => node.getAttribute('srcset').split(' ')[0]);
        article.date = await mainElement.$eval('time', node => node.getAttribute('datetime'));

        article.bodyBlockList = await mainElement.$$eval('p#fig-paragraph, ' +
            '#fig-body-heading', nodes => nodes.map(n => n.outerHTML));

        await pageContent.close();
        return article;
    }

    parseLiveNews = async (url)=>{
        const pageLive = await this.browser.newPage();
        await pageLive.goto(url, {waitUntil: 'load', timeout: 0});
        await pageLive.waitForSelector('div#live-messages', {timeout: 0});
        const liveElementList = await pageLive.$$('article[class*="live-message"]');
        return await Promise.all(liveElementList.map(async element => {
            const liveTitle = await element.$eval('[itemprop="headline"]', async node => node.innerText)
            return {
                liveTitle,
                liveHref: url,
                liveTime: await element.$eval('time', node=>node.getAttribute('datetime')),
                liveContent: {
                    title: liveTitle,
                    summary: await element.$eval('#live-article', node=>node.innerHTML)

                }
            };
        }));
    }
}

module.exports = LeFigaroCrawler;


