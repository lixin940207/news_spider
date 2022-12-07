const categories = require('./categories');
const {asyncTranslate} = require("./translations");
const {ENABLE_TRANSLATE} = require("../../config/config");
const assert = require("assert");

async function ifSelectorExists(element, selector) {
    return (await element.$$(selector)).length > 0;
}

function determineCategory(str) {
    let res = [];
    const lowerStr = str.toString().toLowerCase();
    const category_keys = Object.keys(categories);
    for (let i = 0; i < category_keys.length; i++) {
        if (categories[category_keys[i]].filter(x => lowerStr.includes(x)).length > 0) {
            res.push(category_keys[i]);
        }
    }
    return res;
}

async function getImageHref(element, selector = 'img', order = -1) {
    if (await ifSelectorExists(element, selector)) {
        let srcs = [];
        srcs.push(await element.$eval(selector, node => node.getAttribute('srcset')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-srcset')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-src')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('src')));
        srcs.push(await element.$eval(selector, node => node.getAttribute('data-url')));
        const src = srcs.filter(i => i !== null && i !== undefined && i.startsWith('http'))[0];
        if (src === undefined) {
            return undefined;
        }
        src.replace('{width}', '400');
        const srcSplit = src.split(/[\s,;]+/)
        const srcSplitFilter = srcSplit.filter(i => i.length > 5);
        if (order === 1) {
            return srcSplitFilter[0];
        } else {
            return srcSplitFilter[srcSplitFilter.length - 1];
        }
    }
    return undefined;
}

function getDisplayOrder(ranking, current_ts) {
    return ranking * 0.01 - current_ts;
}

async function getBodyBlockList(element, selectors, ori) {
    let blockList = await element.$$eval(selectors, (nodes, ori) => nodes.map(
        n => {
            console.log(n.outerHTML)
            if (n.tagName === 'P') {
                return {
                    type: 'p',
                    [ori]: n.innerText,
                }
            } else if (n.tagName === 'IMG') {
                let srcs = [];
                srcs.push(n.getAttribute('srcset'));
                srcs.push(n.getAttribute('data-srcset'));
                srcs.push(n.getAttribute('data-src'));
                srcs.push(n.getAttribute('src'));
                srcs.push(n.getAttribute('data-url'));
                const src = srcs.filter(i => i !== null && i !== undefined && i.startsWith('http'))[0];
                if (src === undefined) {
                    return undefined;
                }
                src.replace('{width}', '400');
                const srcSplit = src.split(/[\s,;]+/)
                const srcSplitFilter = srcSplit.filter(i => i.length > 5);
                return {
                    type: 'img',
                    src: srcSplitFilter[srcSplitFilter.length - 1].replace('{width}', '400'),
                }
            } else if (n.tagName === 'UL') {
                let liList = [];
                try {
                    n.getElementsByTagName('li').forEach((item) => liList.push(item.innerText))
                    return {
                        type: 'ul',
                        [ori]: liList,
                    }
                } catch (e) {
                    return {
                        type: 'ul',
                        [ori]: [],
                    }
                }
            } else if (n.tagName === 'H2' || n.tagName === 'H3') {
                return {
                    type: 'h2',
                    [ori]: n.innerText,
                }
            } else if (n.tagName === 'BLOCKQUOTE') {
                return {
                    type: 'blockquote',
                    [ori]: n.innerText,
                }
            } else if (n.tagName === 'DIV') {
                if (n.getElementsByTagName('figure').length > 0) {
                    return {
                        type: 'img',
                        src: n.getElementsByTagName('img')[0].getAttribute('src').split(/[\s,;]+/)[0],
                    }
                } else {
                    return {
                        type: 'p',
                        [ori]: n.innerText,
                    }
                }
            } else {
                return {type: n.tagName, [ori]: n.outerHTML};
            }
        }
    ), ori);
    blockList = blockList.filter(i => i !== undefined && i !== null);
    if (ENABLE_TRANSLATE) {
        const ul_texts = blockList.filter(i => i.type === 'ul').map(i => i[ori]);
        const ul_texts_prediction = [];
        for (let i = 0; i < ul_texts.length; i++) {
            ul_texts_prediction.append(await asyncTranslate(ul_texts, ori));
        }
        const p_texts = blockList.filter(i => ['p', 'h2', 'blockquote'].includes(i.type)).map(i => processStr(i[ori]))
        const p_texts_prediction = await asyncTranslate(p_texts, ori);

        assert(p_texts.length === p_texts_prediction.en.length)
        assert(p_texts.length === p_texts_prediction.fr.length)
        assert(p_texts.length === p_texts_prediction.zh.length)

        for (let i = blockList.length - 1; i >= 0; i--) {
            if (blockList[i].type === 'ul') {
                blockList[i] = ul_texts_prediction.pop()
            } else if (['p', 'h2', 'blockquote'].includes(blockList[i].type)) {
                blockList[i].en = p_texts_prediction.en.pop();
                blockList[i].fr = p_texts_prediction.fr.pop();
                blockList[i].zh = p_texts_prediction.zh.pop();
            }
        }
    }
    return blockList;
}

function processStr(str) {
    return str.trim().replace(/(\n)+/, ' - ');
}

module.exports = {
    ifSelectorExists,
    determineCategory,
    getImageHref,
    getDisplayOrder,
    getBodyBlockList,
    processStr,
}
