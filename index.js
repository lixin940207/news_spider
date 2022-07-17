const fork = require("child_process").fork;

// fork('./services/bbc/fetch_latest_service.js');
// fork('./services/nytimes/fetch_latest_service.js');
// fork('./services/bfm/fetch_latest_service.js');
// fork('./services/france24/fetch_latest_service.js');
fork('./services/lefigaro/fetch_latest_service.js');
fork('./services/lemonde/fetch_latest_service.js');
fork('./services/leparisien/fetch_latest_service.js');

// fork('./services/bbc/fetch_china_service.js');
// fork('./services/nytimes/fetch_china_service.js');
// fork('./services/bfm/fetch_china_service.js');
// fork('./services/france24/fetch_china_service.js');
// fork('./services/lefigaro/fetch_china_service.js');
// fork('./services/lemonde/fetch_china_service.js');
// fork('./services/leparisien/fetch_china_service.js');




