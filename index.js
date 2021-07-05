const fork = require("child_process").fork
require('./services/mongodb_connection');


fork('./services/bbc_service.js');
fork('./services/nytimes_service.js');
fork('./services/lemonde_service.js');


