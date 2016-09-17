# interlayer
Minimalistic and fast web server

[![npm version](https://img.shields.io/npm/v/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![npm downloads](https://img.shields.io/npm/dm/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![github license](https://img.shields.io/github/license/donkilluminatti/interlayer.svg)](https://github.com/DonKilluminatti/interlayer/blob/master/LICENSE)

### Features
* in its current form is a REST-api server
* it is possible to add your own modules and dals
* the server can restart each time a file changes
* coloring of the log in the console
* as if to run the server as a service, can be seen through tailf colored logs
* size of data obtained by POST maximum 976kb, 1e6 symbols
* you can pick up a cluster of servers for load balancing. Dangling nodes while automatically restart

#### Future
* add file returns
* add file upload
* add the ability to use the add-ons for each request, such as preauthorization
* add processing off fall and completion

### Installation
```js
npm install --save interlayer
```	

### How to use
```js
let interlayer = require('interlayer');
let server = new interlayer();
server.addModulesPath('modules');
let config = {
    useDals: ['redis'],
    port: 80,
    type: 'server'
};
server.init(config);
```	
##### Methods
* `server.addModulesPath('mymodules');` - Add the path to the folder with your modules. (_The folder **mymodules** must be in the same folder where is called `server.init(config);` or you can type absolute path_)  [How to create](#create-module)
* `server.addDalsPath('dalPath');` - Add the path of the folder with dal. (_The folder **dalPath** must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal)
* `server.init(config);` - start server. Configuration settings are specified [below](#configuration)

##### Configuration:
* `config.logPath = './'` - path where will be created `logs.log` file
* `config.port = 80;` - Port of web server
* `config.numOfServers = 1;` - number of parallel servers for load balancing. If number more than 1, uses node cluster
* `config.useWatcher = true;` - if this option is true the server will restart automatically when changing files in the folder with modules.
* `config.useDals = ['redis'];` - An array of the names of DALs that you will use in your project. [How to use](#use-dals).
* `config.useDals = {redis: {host: ''}}` - Another way to define which of DALs will be used, with configurations. For redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties)
* `config.modules = ['mymodulesfolder'];` - An array of modules folders. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-module)
* `config.dals = ['mydalsfolder'];` - An array of dals folders. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal)
* `config.defaultHeaders = {'Access-Control-Allow-Origin',:'*'};` - An object with headers, which must to add to every response

##### Experimental
* `config.disableNagleAlgorirm = true;` - Disable Nagle algoritm for connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm)
* `config.debug=true;` - Allow to display `log.d` in console and adding to log file




### Create module
```js
let log = global.logger.create('moduleID');

// You can use this logs
log.i() // Usual log - displayed in green
log.w() // Warn - displayed in yellow
log.e() // Error - displayed in red
log.c() // Critical error - displayed in white

exports._myMethod = {
    toJson: true
};
// All avaliable properties and methods see [here](#request-properties-and-methods)
exports.myMethod = (request, cb) => {
}

// also you can do prerun before module, example do check auth
exports._myMethod.prerun = (request, moduleMeta, cb) => {
}

// if you want to log requests to this method are not saved and does not appear in the console, you can add
exports._myMethod.skipRequestLog = true;

// you can add initialization for module where simpleContext is {DAL: {}}
exports.__init = (simpleContext) => {
}

// You can add meta, then all of its properties will be extended to all methods of the module
exports.__meta = {
    contentType: 'json' // or toJson: true - JSON.stringify of responce data
}
```

#### Request properties and methods
##### Properties
* `request.params` - An object of parsed GET params
* `request.post` - An object of parsed POST params
* `request.cookies` - An object parsed cookies
* `request.method` - Uppercased type of request - POST|GET|...
* `request.isPost` - true|false
* `request.DAL` - An object with DALs, which you specified in `config.useDals`
* `request.headers` - An object of request headers
* `request.config` - An object of configuration which you specified at start of server

##### Methods
* `request.addCookies(key, value)` - set cookies to response
* `request.rmCookies(key)` - delete cookies of expire cookies in responce
###### Manual responses
* `request.error(error)` - return an error in the response, where *error* is text of Error instance
* `request.end(text, code, headers, type)` - instead of calling callback you can return custom response, where *text* is responce, *code* is HTTP status code, *headers* is object with headers, *type=bin* is specified only if you return the binary data
* `request.getResponse()` - this method return response instance


##### Use dals:
```js
    request.DAL.redis.get('somekey', (err, data) => {
        if(err){
            log.e('redis.get somekey', err);
            return cb(err);
        }
        ...
    });
```

### Create dal
*nameofdal.js* - then you can add `nameofdal` to `config.useDals` array (ex: `config.useDals = ['nameofdal'];`)
```js
// init is not required
exports.init = (config) => {
};
// but methods is required
exports.methods = {
    get: () => {},
    set: () => {}
}
```
