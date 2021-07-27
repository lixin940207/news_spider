const axios = require('axios');
const categories = require('./categories');
const {Translate} = require('@google-cloud/translate').v2;
const {TRANSLATION_API, API_KEY} = require("../../config/config");

const translate = new Translate({
    projectId: "stellar-acre-320617",
    keyFilename: "./config/stellar-acre-320617-59ecbb8ce446.json"});


async function ifSelectorExists(element, selector) {
    return (await element.$$(selector)).length > 0;
}

function determineCategory(str) {
    let res = [];
    const lowerStr = str.toString().toLowerCase();
    const category_keys = Object.keys(categories);
    for (let i = 0; i < category_keys.length; i++) {
        if (categories[category_keys[i]].filter(x=>lowerStr.includes(x)).length > 0)
        {
            res.push(category_keys[i]);
        }
    }
    return res;
}

async function getImageHref(element, selector='img', order=-1) {
    if (await ifSelectorExists(element, selector)) {
        let srcs = [];
        srcs.push(await element.$eval(selector, node => node.getAttribute('srcset')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-srcset')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-src')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('src')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-url')));
        const src = srcs.filter(i=> i!==null && i!==undefined && i.startsWith('http'))[0];
        if (src === undefined){
            return undefined;
        }
        src.replace('{width}', '400');
        const srcSplit = src.split(/[\s,;]+/)
        const srcSplitFilter = srcSplit.filter(i=>i.length>5);
        if(order === 1){
            return srcSplitFilter[0];
        }else{
            return srcSplitFilter[srcSplitFilter.length - 1];
        }
    }
    return undefined;
}

function getImgNodeSrc(node, order=1){
    let srcs = [];
    srcs.push(node.getAttribute('srcset'));
    srcs.push(node.getAttribute('data-srcset'));
    srcs.push(node.getAttribute('data-src'));
    srcs.push(node.getAttribute('src'));
    srcs.push(node.getAttribute('data-url'));
    const src = srcs.filter(i=> i!==null && i!==undefined && i.startsWith('http'))[0];
    if (src === undefined){
        console.log(node.outerHTML)
    }
    src.replace('{width}', '400');
    const srcSplit = src.split(/[\s,;]+/)
    const srcSplitFilter = srcSplit.filter(i=>i.length>5);
    if(order === 1){
        return srcSplitFilter[0];
    }else{
        return srcSplitFilter[srcSplitFilter.length - 1];
    }
}

function getDisplayOrder(ranking, current_ts) {
    return ranking * 0.01 - current_ts;
}

async function translateText(q, target='zh-CN') {
    let [translations] = await translate.translate(q, target);
    // translations = Array.isArray(translations) ? translations : [translations];
    // console.log('Translations:');
    // translations.forEach((translation, i) => {
    //     console.log(`${q[i]} => (${target}) ${translation}`);
    // });
    return translations;
}

async function getBodyBlockList(element, selectors) {
    return await element.$$eval(
        selectors,
        nodes => nodes.map(
            n => {
                if (n.tagName === 'P'){
                    console.log(n)
                    console.log(n.outerHTML)
                    return {
                        type: 'p',
                        ori: n.innerText
                    }
                }else if(n.tagName === 'IMG'){
                    return{
                        type: 'img',
                        src: n.getAttribute('src') || n.getAttribute('srcset')||n.getAttribute('data-srcset'),
                    }
                }else if(n.tagName === 'UL'){
                    return {
                        type: 'ul',
                        ori: n.getElementsByTagName('li'),
                    }
                }else if(n.tagName === 'H2' || n.tagName === 'H3'){
                    return {
                        type: 'h2',
                        ori: n.innerText,
                    }
                }else if(n.tagName === 'BLOCKQUOTE'){
                    return {
                        type: 'blockquote',
                        ori: n.innerText,
                    }
                }else if(n.tagName === 'DIV'){
                    if (n.getElementsByTagName('figure').length > 0){
                        return {
                            type: 'img',
                            src: n.getElementsByTagName('img')[0].getAttribute('src')
                        }
                    }else{
                        return {
                            type: 'p',
                            ori: n.innerText,
                        }
                    }
                }else{
                    return {type: n.tagName, ori: n.outerHTML};
                }
            }
        ))
}



module.exports = {
    ifSelectorExists,
    determineCategory,
    getImageHref,
    getDisplayOrder,
    translateText,
    getBodyBlockList
}
