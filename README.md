# interlayer
[![npm version](https://img.shields.io/npm/v/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![npm downloads](https://img.shields.io/npm/dm/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![github license](https://img.shields.io/github/license/aidevio/interlayer.svg)](https://github.com/aidevio/interlayer/blob/master/LICENSE)
[![Build Status](https://travis-ci.org/aidevio/interlayer.svg?branch=master)](https://travis-ci.org/aidevio/interlayer)
[![Code Climate](https://codeclimate.com/github/aidevio/interlayer/badges/gpa.svg)](https://codeclimate.com/github/aidevio/interlayer)

Server current in alpha. You can offer/report new issue here: [New issue](https://github.com/aidevio/interlayer/issues/new)

Stable version of this server will be released after all tests and features would be released.

##### !!! UPDATE 0.3.0: I broke old initialization, please rewrite it's in your projects.
##### !!! UPDATE 0.3.17: request.getMethodsInfo function now return methods info with a division into modules. Watch the new structure of return.
##### !!! UPDATE 0.4.0: `startPath` and `rootPath` in `config` replaced with `initPath`. `numOfServers` and `clusters` replaced with `workers`. `useWatcher` replaced with `restartOnChange`. New ability to init server with pass the config file name in the first argument.
##### !!! UPDATE 0.5.0: Fix returning of JSON objects and buffers. This version could broke your code.

## Features
- serve your files
- auto-reload server on file change (reload on new files not supported)
- clusterization
- postgres\mysql\redis built-in DAL's for data storage
- mailgun\sparkpost build-in mail sender packages
- localization

---

## Install
```js
npm install --save interlayer
```
or
```js
yarn add interlayer
```

---

## Configure
`config.json` file:
```js
{
    "port": 80,
    "serve": ["files"]
}
```

#### All configuration params:
Avaliable properties in `config` object or `config.json` file

- `port`: Web server port number. (Default: 8080)
- `secure`: The configuration object with paths to files: `{key:'',cert:''}`
- `initPath` : Web server root path. (Default: ./)
- `logPath`: Path to create the `logs.log` file. (Default: ./)
- `skipDbWarning`: Boolean value. Skip warning in console if useDals not defined in config.
- `timeout`: Timeout in seconds, then user will see `{error: 'TIMEOUT'}` **Note, execution of the method is not interrupted**
- `workers`: Number of instances for load balancing. If number more than 1, uses node.js cluster.
- `restartOnChange`: Boolean value determine is server will restart automatically when files in the folder with `modules` was changed.
- `useDals`: The configuration object for dal modules to be used. Supports redis(for use specify `redis:{}`), mysql(for use specify `mysql:{}` and default will be `{host: '127.0.0.1',user: 'root'}`), postgress(for use specify `postgress:{}` and default will be `{host: '127.0.0.1',user: 'root'}`). For config built-in redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties), mysql [see here](https://github.com/mysqljs/mysql#connection-options), postgres [see here](https://github.com/brianc/node-postgres/wiki/Client#parameters) (Example of dal's config: `useDals: {mysql: {port: 6375, user: 'admin'}, redis: {}}`)
- `useEmailSenders`: The configuration object for the mail senders to be used. Supports mailgun(for use specify `mailgun:{}`) and sparkpost(for use specify `sparkpost:{}`). For config built-in mailgun [see here](https://github.com/mailgun/mailgun-js#setup-client), sparkpost [see here](https://github.com/SparkPost/node-sparkpost#initialization)

- `serve`: An array folders to serve. Priority over the last folder.
- `modules`: An array folders with modules. Priority over the last folder. (Default directory is './modules' unless otherwise specified.) [How to create](#module-creation)
- `views`: An array of folders with files, which you can be uses as templates, or returned through the api(by using request.getView). Priority over the last folder. (Default directory is 'files' unless otherwise specified.)
- `i18n`: An array of folders with localization files. Priority over the last folder. (Default directory is './i18n' unless otherwise specified.) [How to create](#localization)
- `dals`: An array of folders with your dal modules. Priority over the last folder. [How to create](#create-dal)
- `emailSenders`: An array of folders with your email senders. Priority over the last folder. [How to create](#create-email-sender)
- `middleware`: An array of folders with middlewares. Priority over the last folder. [How to create](#create-middleware)
- `middlewareOrder`: An array with ordered names of middlewares
- `middlewareTimeout`: Timeout in second, then user will see `{error: 'TIMEOUT'}` **Note, execution of the runned middlewares is not interrupted**

- `defaultHeaders`: An object with default headers, which have to be added to the every response.
- `debug`: Allow to display `log.d` in console and add to the `logs.log` file.
- `instantShutdownDelay`: Delay in milliseconds after server will shutdown on process SIGINT or SIGTERM signal, or process message: shutdown. (Default: 1500)
- `retryAter`: Time in seconds for Retry-After response header with server HTTP 503 status. Works until `instantShutdownDelay`. (Default: 10)

#### Additional properties
- `disableNagleAlgoritm`: Boolean flag to disable Nagle algoritm for all connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm)

---

## How to use
```js
let config = {
    port: 80,
    serve: ['files']
};
require('interlayer')(config);
```
or
```js
require('interlayer')('config.json');
```
Project tree example:
- /node_modules/
- package.json
- /files/ *`- this folder will be served by confing.serve`*
    - index.html
    - style.css
    - script.js
    - /images/
        - logo.jpeg
- index.js
- config.json

---

## Module creation
Example of modules/myModule.js
```js
// Define meta information for method by adding underscore symbol before the method name, required!
exports._myMethod = {
    toJson: true,// or contentType: 'json' - Return content as JSON content. Default: not defined.
};
// Define module itself with two params: request and cb. 
exports.myMethod = (request, cb) => {
    log.i('I am log without requestId');
    cb(null, {ok: true});
};
```

---

#### Module initialization
These method for current module will be called when web server starts.
```js
// simpleContext -> {DAL: {...}}
exports.__init = (simpleContext) => {
    // do something, example some work with using simpleContext.DAL.redis.blpop
};
```
Defenition of `simpleContext` [see here](https://github.com/aidevio/interlayer/blob/c350c45f21f5c02678e3314d23eed31e0cab0586/system/init.js#L440)

Also in the `__init` might be useful to use:
```js
let fun = deleteInerval=>{
    //dosomething
    deleteInerval();
};
let interval = 1;
// `fun` - function, required; `interval` - number in seconds, not required - 1 second default
let key = global.intervals.add(fun, interval);
//where `key` is identificator of delayed function, might me deleted by `global.intervals.del(key)`

// if `deleteInerval` is not called, `fun` will be called each time after `interval`
global.intervals.disable(key, true) // to disable starting of interval until you call global.intervals.disable(key, false)
```

---

#### Module meta
This specify meta's for all methods in this module:
```js
exports.__meta = {
    toJson: true
};
```

For the case, when you need to return content from the root of the module(ex: /mymodule) without method name you can use:
```js
exports.___meta = {
    html: (request, cb)=>{}
};
```

If you want to process method name manualy or implement `/go/myLink` functionality you can use:
```js
exports.___meta = {
    find: (request, cb)=>{
        //request.path to parse moduleId/methodId
    }
};
```
*Remember that priority in processing a method name will be over explicitly spelled method names*

---

#### Features
**Logging:**
```js
let log = global.logger.create('moduleID');
log.i(); // Usual log - displayed in green
log.w(); // Warn - displayed in yellow
log.e(); // Error - displayed in red
log.c(); // Critical error - displayed in white
```

Note that this type of logging don't allow to track the request id.
To have ability track the request id use the `request.modifyLog` method:
```js
let log = global.logger.create('moduleID');
exports.myMethod = (request, cb)=>{
    let log = request.modifyLog(log);
}
```

Or use the `request.log` instead, if 'moduleID'(identifier specified in `global.logger.create` function) not required.
```js
let log = global.logger.create('moduleID');
exports.myMethod = (request, cb)=>{
    let log = request.log;
}
```

---

**Method meta**
```js
// Meta is REQUIRED  and specified by adding underscore symbol before the method name
exports._myMethod = {
    toJson: true
};
// Module definition - see below...
// exports.myMethod = ...
```

Meta's:
- `contentType: 'json'` / `toJson = true`: Return content as JSON content. Default: not defined.
- `timeout: 60`: Timeout in seconds before user will see the `{error: 'TIMEOUT'}`. Default: `60`.
- `path: "method1/submethod1"`: Allows to define custom method path. Path will be defined as `/myModule/method1/submethod1`. Default:  `/myModule/method1/`
- `addToRoot: true`: Boolean value which define is method must be located at ~~myModule~~`/myMethod` without specifying the module name. Default: not defined.
- `skipRequestLog: true;`: Boolean value which define is method call must be skipped in console log.Default: not defined.
- `prerun: (request, moduleMeta, cb) => {}`: Function or link to function which will be runned before method. May be usefull for preparing request. Default: not defined.
- `hidden: true`: Boolean value which used to hide method in return of request.getMethodsInfo(), but ignored if method request.getMethodsInfo calls with first boolead param true. Be carefull, cause this method also return methods meta info. Default: not defined.
- `disableNagleAlgoritm: true`: Boolead value, which disable or enable Nagle algorytm, redefine `config.disableNagleAlgoritm` value for current module\method. Default: not defined.

---

**Method request parameters**
```js
exports._myMethod = {};
// @request@ is an object provides information and methods for working with data's, file's, mail's and other.
// @callback(error, data, responseCode, responseHeaders, type)@ returns result to user
exports.myMethod = (request, callback) => {
    request.log.i('method called');
    callback(null, 'I\'m a teapot.', 418, {'hiddenHeader':'I\'m a teapot.'}, 'text');
}
```

**`request` properties**
- `request.config` - An object of configuration specified at start of server
- `request.ip` - Client ip adress
- `request.url` - Request url
- `request.path` - Request path(module/method)
- `request.method` - Uppercased type of request - POST|GET|...
- `request.isPost` - true|false
- `request.params` - An object of parsed GET params
- `request.post` - An object of parsed POST params
- `request.cookies` - An object of parsed cookies
- `request.headers` - An object of request headers
- `request.DAL` - An object with DALs, which was initialized by `config.useDals`
- `request.mail` - An object with mail senders, which was initialized by `config.useEmails`. 
- `request.id` - requestID
- `request.log` - The same as `global.logger.create(moduleID)`, but with requestID included(not include moduleID)


**`request` methods**
- `request.modifyLog(log)` - modify log instance by add to top of logged arguments additional request information, but `request.log.i()` can be used instead.
- `request.getView('file.html', cb)` - return file data in `cb` (from one of folders specified in `config.views`).
- `request.getViewSync('file.html')` - sync version of getView. return file(from one of folders specified in `config.views`) content or *null* if file not found.
- `request.getFile('file.mp3', cb)` - return file as is with third cb argument with Content-Type
- `request.addCookies(key, value)` - set cookies to response (alias: addCookie,setCookie,setCookies).
- `request.rmCookies(key)` - delete cookies of expire cookies in responce (alias: rmCookie,delCookie).
- `request.l18n(key, def)` - return localized string(folder with localization must be defined in `config.i18n = []`). In key not found, returns `def`.
- `request.getMethodsInfo()` - return an array of defined methods except hiddened by flag `hidden`. If called with 1-st param `true` return hidden methods. This method can be helpful for return api information.
- `request.lockShutdown(ms)` - lock instant process shutdown by request for 10 000 ms or for `ms` ms, delay instant shutdown for application setted to 1500 ms(or see `config.instantShutdownDelay`)
- `request.unlockShutdown()` - again allow instant process shutdown
- `request.error(text)` - 503 http code with `text` error return when `config.debug` == true

**`request.helpers`** methods
- `request.helpers.generateId()` - geneate 8-character identifier(a-zA-Z0-9)
- `request.helpers.clearObj(obj, toRemove)` - delete parameters of `obj` from `toRemove` array of strings
- `request.helpers.isBoolean(val)` - check is `val` string is Boolean(true|false)
- `request.helpers.JSV(json, schema, envId)` - https://www.npmjs.com/package/JSV. Create environment with `envId` and call `validate` with `json` and `schema`
- `request.helpers.mime(file, fallback)` - return mime type by file extension or `fallback` or 'application/octet-stream'

**Manual responses**
- `request.getResponse()` - this method return unchanged response instance.
- `request.error(error)` - return an error in the response, where *error* is text of Error instance
- `request.end(text, code, headers, type)` - instead of calling callback you can return custom response where:
    - *text* is responce
    - *code* is HTTP status code
    - *headers* is object with headers
    - *type* only makes sense in the value `bin` - for binary response

And finally consider method callback
*exports.myMethod = (request, **cb**)=>{}*
```js
cb(error, data, responseCode, responseHeaders, type)
//- error - may be error instance or string, number, array, object
//- data - responce, may be string, number, array, object, buffer
//- responseCode - is HTTP status code
//- responseHeaders - manual headers for response
//- type - only makes sense in the value `bin` - for responce binary data
```

---

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

---

**Use email senders**
```js
request.mail.mailgun.send({}, callback) -> see params here https://documentation.mailgun.com/api-sending.html#sending
request.mail.sparkpost.send({}, callback) -> see params here https://developers.sparkpost.com/api/transmissions.html#header-transmission-attributes
//or use initialized senders as you want
request.mail.mailgun.client -> https://www.npmjs.com/package/mailgun-js
request.mail.sparkpost.client -> https://www.npmjs.com/package/sparkpost
```

---

## Create dal
Example of `dals/nameofdal.js`
Then you can add `nameofdal` to `config.useDals` array (ex: `config.useDals = {nameofdal: {...config}};`)
```js
// init is not required
exports.init = (config, dalConfig) => {

};

// but methods is required
exports.methods = {
    get: () => {},
    set: () => {}
}
```

---

## Create email sender
Example of `emailSenders/nameofsender.js`
Then you can add `nameofsender` to `config.useEmailSenders` array (ex: `config.useEmailSenders = {nameofsender: {...config}};`)
```js
// init is required
exports.init = (config, emailConfig) => {

};

// send is required
exports.send = (email, cb)=>{

}
```

---

## Create middleware
Example of `middleware/session.js`
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

---

## Localization
Example of `i18n/en.js`
**Note! You have to use double quotes, instead single quotes, because it's json file**
```json
{
    "title_error_404": "Nothing found, 404, Bill Gates site"
}
```
