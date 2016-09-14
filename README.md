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

#### Future
* do raise the possibility of multiple servers for load balancing using `cluster`
* add file returns
* add file upload
* add the ability to use the add-ons for each request, such as preauthorization
* 

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
    initDals: ['redis'],
    port: 80,
    type: 'server'
};
server.init(config);
```	

* `server.addModulesPath('mymodules');` - Add the path to the folder with your modules. (_The folder **mymodules** must be in the same folder where is called `server.init(config);` or you can type absolute path_)  [How to create](#create-module)
* `server.addDalsPath('dalPath');` - Add the path of the folder with dal. (_The folder **dalPath** must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal)
##### Configuration:
* `config.port = 80;` - Port of web server
* `config.type = 'server';` - Type of server, is just web server, of web server wrapped in watcher. 
If you enter 'watcher' the server will restart automatically when changing files in the folder with modules.
* `config.initDals = ['redis'];` - An array of the names of DALs that you will use in your project. [How to use](#use-dals).
* `config.modules = ['mymodulesfolder'];` An array of modules folders. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-module)
* `config.dals = ['mydalsfolder'];` An array of dals folders. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal)

### Create module
```js
let log = global.logger.create('moduleID');
log.i() // Usual log - displayed in green
log.w() // Warn - displayed in yellow
log.e() // Error - displayed in red
log.c() // Critical error - displayed in white

exports._method = {};
exports.method = (request, cb) => {
    request.params // GET params
    request.post // POST params
    request.cookies // cookies
}
```
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
*nameofdal.js* - then you can add `nameofdal` to `config.initDals` array (ex: `config.initDals = ['nameofdal'];`)
```js
exports.init = (config) => {
};
exports.methods = {
    get: () => {},
    set: () => {}
}
```
