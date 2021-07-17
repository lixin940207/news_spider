require('./services/mongodb_connection');
const fork = require("child_process").fork;

// (async ()=>{
fork('./services/bbc_service.js');
fork('./services/nytimes_service.js');
// fork('./services/lemonde_service.js');
// fork('./services/lefigaro_service.js');
// fork('./services/france24_service.js');
// fork('./services/leparisien_service.js');
// fork('./services/bfm_service.js');


// })()
//     .then()
//     .catch()



