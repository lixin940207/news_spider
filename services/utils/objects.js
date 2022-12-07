function ArticleObject () {
    this.title = {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    };
    this.summary = {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    };
    this.articleHref = undefined;
    this.headImageHref = undefined;
    this.publishTime = undefined;
    this.bodyBlockList = [];
    this.abstract = {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    };
}

function NewsObject () {
    this.articleHref = undefined;
    this.imageHref = undefined;
        this.title = {
            zh:undefined,
            cn:undefined,
            fr:undefined,
        };
    this.region =  undefined;
    this.categories = [];
    this.publishTime = undefined;
    this.ranking = undefined;
    this.displayOrder = undefined;
    this.summary = {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    };
    this.newsType = undefined;
    this.isLive = undefined;
    this.liveNewsList = [];
    this.article = undefined;
    this.isVideo = undefined;
    this.relatedNewsList= [];
}

const relatedNewsObject = {
    title: {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    },
    article: undefined,
}

const liveNewsObject = {
    liveTitle: {
        zh:undefined,
        cn:undefined,
        fr:undefined,
    },
    liveTime: undefined,
    liveHref: undefined,
    liveContent: undefined,
}

const bodyBlockObject = {
    type: undefined,
    src: undefined,
    zh:undefined,
    cn:undefined,
    fr:undefined,
}


module.exports = {
    NewsObject,
    relatedNewsObject,
    liveNewsObject,
    bodyBlockObject,
    ArticleObject
}
