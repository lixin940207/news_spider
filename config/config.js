
module.exports = {
    ORIGINAL_URLS: {
        BBCURL: 'https://www.bbc.com/news',
        NYTimeURL: 'https://www.nytimes.com/',
        LeFigaroURL: 'https://www.lefigaro.fr/',
        LeMondeURL: 'https://www.lemonde.fr/',
        France24URL: 'https://www.france24.com/fr/france/',
        LeParisienURL: 'https://www.leparisien.fr',
        BFMURL:'https://www.bfmtv.com',
    },
    CHINA_NEWS_URLS: {
        BBCURL: 'https://www.bbc.com/news/world/asia/china',
        NYTimesURL: 'https://cn.nytimes.com/china/',
        LeMondeURL: 'https://www.lemonde.fr/chine/',
        LeFigaroURL: 'https://plus.lefigaro.fr/tag/chine',
        LeParisienURL: 'https://www.leparisien.fr/international',
        BFMURL: 'https://www.bfmtv.com/international/asie/chine/',
        France24URL: 'https://www.france24.com/fr/asie-pacifique/',
    },
    TECHNOLOGY: {
        BBCURL: 'https://www.bbc.com/news/technology',
        TechCrunchURL: 'https://techcrunch.com',
        WIRED: 'https://www.wired.com'
    },
    LANGUAGE: {
        BBC: 'en',
        BFM: 'fr',
        FRANCE24: 'fr',
        LeFigaro: 'fr',
        LeMonde: 'fr',
        LeParisien: 'fr',
        NYTimes: 'en',
        TechCrunch: 'en',
        WIRED: 'en',
    },
    REDIS_NLP_TRANSLATE_QUEUE_KEY: "nlp_translate_queue",
    REDIS_NLP_SUMMARIZE_QUEUE_KEY: "nlp_summarize_queue",
    ENABLE_TRANSLATE: true,
}
