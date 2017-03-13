# interlayer
[![npm version](https://img.shields.io/npm/v/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![npm downloads](https://img.shields.io/npm/dm/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![github license](https://img.shields.io/github/license/donkilluminatti/interlayer.svg)](https://github.com/DonKilluminatti/interlayer/blob/master/LICENSE)
[![Build Status](https://travis-ci.org/aidevio/interlayer.svg?branch=master)](https://travis-ci.org/aidevio/interlayer)
[![Code Climate](https://codeclimate.com/github/aidevio/interlayer/badges/gpa.svg)](https://codeclimate.com/github/aidevio/interlayer)

Server current in alpha. You can offer or report new issue here: [New issue](https://github.com/DonKilluminatti/interlayer/issues/new)

Stable version will be released when will be provided all tests and determines all features of this server. Currently I use this server in the several projects.

##### !!! MAJOR UPDATE 0.3.0: I'm was break old initialization, rewrite please it in your projects.

## Features
* serve your files
* auto-reload server on file change (new files not support handle reload)
* clusterization
* postgres\mysql\redis built-in DAL's for data storage
* mailgun\sparkpost build-in mail sender packages
* localization

## Install
```js
npm install --save interlayer
```

## How to use
```js
let config = {
    port: 80,
    serve: ['files']
};
require('interlayer')(config);
```
Project tree example:
* /node_modules/
* package.json
* /files/ *`- this folder will be served by confing.serve`*
    * index.html
    * style.css
    * script.js
    * /images/
        * logo.jpeg
* index.js

## All configuration params:
`config` object properties

* `port`: Port number of web server. (Default: 8080)
* `startPath` / `rootPath`: Root server path. (Default: ./)
* `logPath`: Path where will be created `logs.log` file. (Default: ./)
* `timeout`: Timeout number in seconds at the expiration of user will see `{error: 'TIMEOUT'}` **Note, execution of the method is not interrupted**
* `numOfServers` / `clusters`: Number of phisical processors | number of parallel servers for load balancing. If number more than 1, uses node cluster.
* `useWatcher`: Boolean value determine is server will restart automatically when files in the folder with modules was changed.
* `useDals`: An object of dal modules which need to include. Last version supports redis, mysql, postgress. For built-in redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties), mysql [see here](https://github.com/mysqljs/mysql#connection-options), postgres [see here](https://github.com/brianc/node-postgres/wiki/Client#parameters)
* `serve`: An array folders to serve. Priority over the last folder.
* `modules`: An array folders with modules. Priority over the last folder. (Default dir 'modules' unless otherwise specified.) [How to create](#create-module)
* `dals`: An array of folders with your dal modules. Priority over the last folder. (Default dir 'dals' unless otherwise specified.) [How to create](#create-dal)
* `middleware`: An array of folders with middlewares. Priority over the last folder. [How to create](#create-middleware)
* `middlewareOrder`: An array with ordered names of middlewares
* `middlewareTimeout`: Timeout number in seconds at the expiration of user will see `{error: 'TIMEOUT'}` **Note, execution of the middlewares is not interrupted**
* `views`: An array of folders with files, which you can be uses as templates, or returned through the api. Priority over the last folder. (Default dir 'files' unless otherwise specified.)
* `i18n`: An array of folders with localization files. Priority over the last folder. (Default dir 'i18n' unless otherwise specified.) [How to create](#localization)
* `defaultHeaders`: An object with default headers, which have to be added at every response.
* `debug`: Allow to display `log.d` in console and adding to log file.

## Experimental properties
* `disableNagleAlgoritm`: Boolean flag to disable Nagle algoritm for all connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm)

## Create module
Example of modules/myModule.js

```js
// you may need to log something, see above methodLog methods
let log = global.logger.create('moduleID');

// define meta information for method, without it method will be unvisible
exports._myMethod = {
    toJson: true
};
exports.myMethod = (request, cb) => {
    log.i('I am log without requestId')
    cb(null, {ok: true});
};
```

### Features
**Logging:**
```js
let methodLog = global.logger.create('moduleID')
methodLog.i() // Usual log - displayed in green
methodLog.w() // Warn - displayed in yellow
methodLog.e() // Error - displayed in red
methodLog.c() // Critical error - displayed in white
```
Similar methods are provided in `request.log` but with writing down additional information about request id.

**Method meta**
```js
// Meta is specified by adding an underscore before the method name
exports._module = {
    toJson: true
};
// definition of module - see below
exports.module = ...
```

Metas:
* `contentType = 'json'` / `toJson = true`: Return content as JSON content.
* `timeout = 60`: Timeout number in seconds before response on hung request will be `{error: 'TIMEOUT'}`.
* `addToRoot = true`: Boolean value which define is method must be located at ~~myModule~~/`myMethod` without specifying the module name.
* `skipRequestLog = true;`: Boolean value which define is method call must be skipped in console log.
* `prerun = (request, moduleMeta, cb) => {}`: Function or link to function which will be runned before method. Its like main method, takes request, and cb, but also takes module meta at the second parametr; May be usefull for preparing request.
* `desc`: Describe information about method, can be used by call request.getMethodsInfo().
* `hidden`: Boolean value which used to hide method in return of request.getMethodsInfo(), but ignored if method request.getMethodsInfo calls with first boolead param true. Be carefull, cause this method also return methods meta info.
* `disableNagleAlgoritm`: Boolead value, experimetal, which disable or enable Nagle algorytm, redefine `config.disableNagleAlgoritm` value for current module\method

These metas also can be specified in `exports.__meta = {}` and will be globaly defined for all module methods.

**Module initialization**

These method will be called at start of server.
```js
// simpleContext -> {DAL: {...}}
exports.__init = (simpleContext) => {
    // do something, example some work with using simpleContext.DAL.redis.blpop
};
```

**Method parametrs**
```js
// @request@ is an object provides all needed information and methods for working with datas, files, mails and other.
// @callback(error, data, responseCode, responseHeaders, type)@ returns result to user
exports.method = (request, callback) => {
}
```

**`request` properties**
* `request.ip` - Client ip adress
* `request.method` - Uppercased type of request - POST|GET|...
* `request.isPost` - true|false
* `request.params` - An object of parsed GET params
* `request.post` - An object of parsed POST params
* `request.cookies` - An object parsed cookies
* `request.headers` - An object of request headers
* `request.config` - An object of configuration which you specified at start of server
* `request.DAL` - An object with DALs, which you specified in `config.useDals`
* `request.mail` - An object with mail senders, which specified in `config.emails`. 

**`request` methods**
* `request.modifyLog(log)` - modify log instance by add to top of logged arguments additional request information, but `request.log.i()` can be used instead.
* `request.getView('file.html', cb)` - return file data in `cb` (from one of folders specified in `config.view`).
* `request.getViewSync('file')` - sync version of getView. return file(from one of folders specified in `config.view`) content or *null* if file not found.
* `request.addCookies(key, value)` - set cookies to response (alias: addCookie,setCookie,setCookies).
* `request.rmCookies(key)` - delete cookies of expire cookies in responce (alias: rmCookie,delCookie).
* `request.l18n(key, def)` - return localized string(folder with localization must be defined in `config.i18n = []`). In key not found, returns `def`.
* `request.getMethodsInfo()` - return an array of defined methods except hidden by flag `hidden`. If called with 1-st param `true` return hidden methods too. This method can be helpful for return api information.

**Manual responses**
* `request.getResponse()` - this method return unchanged response instance.
* `request.error(error)` - return an error in the response, where *error* is text of Error instance
* `request.end(text, code, headers, type)` - instead of calling callback you can return custom response where:
 * *text* is responce
 * *code* is HTTP status code
 * *headers* is object with headers
 * *type* only makes sense in the value `bin` - for binary response

And finally consider method callback
*exports.myMethod = (request, **cb**)*
```js
cb(error, data, responseCode, responseHeaders, type)
//- err - may be error instance or string, number, array, object
//- data - responce, may be string, number, array, object, buffer
//- responseCode - is HTTP status code
//- responseHeaders - manual headers for response
//- type - only makes sense in the value `bin` - for responce binary data
```

**Use dals:**
```js
request.DAL.redis.get('somekey', (err, data) => {
    if(err){
        request.log.e('redis.get somekey', err);
        return cb(err);
    }
    ...
});
request.DAL.mysql.query('SELECT * FROM users WHERE login = ?', ['admin'], (err, data, fields) => {
    if(err){
        request.log.e('mysql.query', err);
        return cb(err);
    }
})
```

**Use email senders**
```js
request.mail.mailgun.send({}, callback) -> see params here https://documentation.mailgun.com/api-sending.html#sending
request.mail.sparkpost.send({}, callback) -> see params here https://developers.sparkpost.com/api/transmissions.html#header-transmission-attributes
//or use initialized senders as you want
request.mail.mailgun.client -> https://www.npmjs.com/package/mailgun-js
request.mail.sparkpost.client -> https://www.npmjs.com/package/sparkpost
```


## Create dal
Example of dals/nameofdal.js
Then you can add `nameofdal` to `config.useDals` array (ex: `config.useDals = {nameofdal: {...config}};`)
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


## Create middleware
Example of middleware/session.js
```js

exports.triggers = {
    'meta.checkSessions': 'checkSession', // you can specified string - name of function exported in module
    'request.params.test': exports.test // also you can specified function or method of object
};

// but methods is required
// request context and callback described in module
exports.checkSession = (request, moduleMeta, cb) => {

};

exports.test = (request, moduleMeta, cb) => {

};
```


## Localization
Example of i18n/en.js
**Note! You have to use double quotes, instead single quotes, cause it's json file**
```json
{
    "title_error_404": "Nothing found, 404, Bill Gates site"
}
```
