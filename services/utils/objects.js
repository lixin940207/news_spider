function ArticleObject () {
    this.title = {
        cn:undefined,
        ori:undefined};
    this.summary = {
        cn:undefined,
        ori:undefined};
    this.articleHref = undefined;
    this.headImageHref = undefined
    this.publishTime = undefined
    this.bodyBlockList = []
}

function NewsObject () {
    this.articleHref = undefined;
    this.imageHref = undefined;
        this.title = {
            cn:undefined,
            ori:undefined};
    this.region =  undefined;
    this.categories = [];
    this.publishTime = undefined;
    this.ranking = undefined;
    this.displayOrder = undefined;
    this.summary = {cn:undefined, ori:undefined};
    this.newsType = undefined;
    this.isLive = undefined;
    this.liveNewsList = [];
    this.article = undefined;
    this.isVideo = undefined;
    this.relatedNewsList= [];
}

const relatedNewsObject = {
    title: {
        cn:undefined,
        ori:undefined
    },
    article: undefined,
}

const liveNewsObject = {
    liveTitle: {cn:undefined, ori:undefined},
    liveTime: undefined,
    liveHref: undefined,
    liveContent: undefined,
}

const bodyBlockObject = {
    type: undefined,
    ori:undefined,
    cn:undefined
}


module.exports = {
    NewsObject,
    relatedNewsObject,
    liveNewsObject,
    bodyBlockObject,
    ArticleObject
}
