
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
    GOOGLE_TRANSLATION_API: "https://translation.googleapis.com/language/translate/v2",
    GOOGLE_API_KEY: "AIzaSyBIaJtErLTriGwvM_BVnmHMt-XBtU_ySAE",
    BAIDU_TRANSLATION_API: "http://api.fanyi.baidu.com/api/trans/vip/translate",
    BAIDU_APP_ID:"20210804000906367",
    BAIDU_SECRET_KEY: "SGizDzpZGle9f5IKj0U3",
    REDIS_INPUT_QUEUE_KEY: "translate_input",
    CRAWL_TIME_INTERVAL: "13 * * * *",
}
