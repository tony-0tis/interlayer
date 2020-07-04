# interlayer
[![npm version](https://img.shields.io/npm/v/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![npm downloads](https://img.shields.io/npm/dm/interlayer.svg?style=flat-square)](https://www.npmjs.com/package/interlayer)
[![github license](https://img.shields.io/github/license/8ai/interlayer.svg)](https://github.com/8ai/interlayer/blob/master/LICENSE)
[![Build Status](https://travis-ci.org/aidevio/interlayer.svg?branch=master)](https://travis-ci.org/aidevio/interlayer)
[![Code Climate](https://codeclimate.com/github/aidevio/interlayer/badges/gpa.svg)](https://codeclimate.com/github/aidevio/interlayer)

At this point, the server version is still in alpha. You can suggest an idea or report an error here: [New issue](https://github.com/8ai/interlayer/issues/new)

The stable version of the server will be implemented after writing all the necessary features and tests to them.

##### !!! UPDATE 0.3.0: Broke the previous initialization, please rewrite it in your projects.
##### !!! UPDATE 0.3.17: The `request.getMethodsInfo` function now returns full method information.
##### !!! UPDATE 0.4.0: `startPath` and `rootPath` in `config` replaced with `initPath`. `numOfServers` and `clusters` replaced with `workers`. `useWatcher` replaced with `restartOnChange`. New ability to init server with pass the config file name in the first argument.
##### !!! UPDATE 0.5.0 - 0.6.0: Fix returning of JSON objects, buffers, numbers, booleans, nulls, functions, undefined, symbols. This version could broke your code.
##### !!! UPDATE 0.7.0: Changed the way server and modules are initialized.

## Features
- Serving Static Content
- Auto-reload server on file change (reload on new files not supported)
- Clusterization
- Postgres\mysql\redis built-in DAL's for data storage
- Mailgun\sparkpost build-in mail sender packages
- Localization

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

## Project tree example
`config.json` content:
```js
{
    "port": 80,
    "serve": ["files"]
}
```

- /node_modules/
- package.json
- /files/ *`- this folder will be served by config.serve`*
    - index.html
    - style.css
    - script.js
    - /images/
        - logo.jpeg
- index.js
- config.json

---

## `config` object or `config.json` file configuration

#### Avaliable params:
Avaliable properties in `config` object or `config.json` file

| Property | Default | Type | Description |
| ------ | ------ | ------ | ------ |
| `port` | 8080 | Number | Web server port number |
| `secure` | --- | Object | SSL configuration object with paths to files: `{key:'',cert:''}`
| `initPath` | ./ | String | Web server root path |
| `logPath` | ./ | String | Path to create the `logs.log` file |
| `timeout` | 60(sec) | Number | Timeout in seconds, then user will see `{error: 'TIMEOUT'}` **Note, execution of the method is not interrupted** |
| `workers` | 1 | Number | Number of instances for load balancing. If number more than 1, uses node.js cluster |
| `restartOnChange` | false | Boolean | Flag determine is server will restart automatically when files in the folder with `modules` was changed |
| `useDals` | --- | Object[dalName] = dalConfig | The configuration object for dal modules to be used. Supports redis(for use specify `redis:{}`), mysql(for use specify `mysql:{}` and default will be `{host: '127.0.0.1',user: 'root'}`), postgress(for use specify `postgress:{}` and default will be `{host: '127.0.0.1',user: 'root'}`). For config built-in redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties), mysql [see here](https://github.com/mysqljs/mysql#connection-options), postgres [see here](https://github.com/brianc/node-postgres/wiki/Client#parameters) (Example of dal's config: `useDals: {mysql: {port: 6375, user: 'admin'}, redis: {}}`) |
| `useEmailSenders` | --- | Object[emailSenderName] = emailSenderConfig | The configuration object for the mail senders to be used. Supports mailgun(for use specify `mailgun:{}`) and sparkpost(for use specify `sparkpost:{}`). For config built-in mailgun [see here](https://github.com/mailgun/mailgun-js#setup-client), sparkpost [see here](https://github.com/SparkPost/node-sparkpost#initialization) |
| `serve` | --- | Array[Strings[]] | An array folders to serve. Priority over the last folder |
| `modules` | ./modules | Array[Strings[]] | An array folders with modules. Priority over the last folder. (Default directory is './modules' unless otherwise specified.) [How to create](#module-creation) |
| `views` | ./files | Array[Strings[]] | An array of folders with files, which you can be uses as templates, or returned through the api(by using request.getView). Priority over the last folder. (Default directory is './files' unless otherwise specified.) |
| `i18n` | ./i18n | Array[Strings[]] | An array of folders with localization files. Priority over the last folder. (Default directory is './i18n' unless otherwise specified.) [How to create](#localization) |
| `dals` | --- | Array[Strings[]] | An array of folders with your dal(Data Access Layer) modules. Priority over the last folder. [How to create](#create-dal) |
| `emailSenders` | --- | Array[Strings[]] | An array of folders with your email senders. Priority over the last folder. [How to create](#create-email-sender) |
| `middleware` | --- | Array[Strings[]] | An array of folders with middlewares. Priority over the last folder. [How to create](#create-middleware) |
| `middlewareOrder` | --- | Array[Strings[]] | An array with ordered names of middlewares |
| `middlewareTimeout` | 10(sec) | Number | Timeout in second, then user will see `{error: 'TIMEOUT'}` **Note, execution of the runned middlewares is not interrupted** |
| `skipDbWarning` | false | Boolean | Skip warning in console if useDals not defined in config |
| `defaultHeaders` | --- | Object[headerName] = headerValue | An object with default headers, which have to be added to the every response |
| `debug` | false | Boolean | Allow to display `log.d` in console and add to the `logs.log` file |
| `instantShutdownDelay` | 1500(ms) | Number | Delay in milliseconds after server will shutdown on process SIGINT or SIGTERM signal, or process message: shutdown |
| `retryAter` | 10(sec) | Number | Time in seconds for Retry-After response header with server HTTP 503 status. Works until `instantShutdownDelay` |
| `disableNagleAlgoritm` | false | Boolean | Flag to disable Nagle algoritm for all connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm) |


### How to use

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

---

## Intrlayer instance configure
```js
let serverInstance = require('interlayer').server();
```
#### Avaliable methods:

| Property | Default | Type | Description |
| ------ | ------ | ------ | ------ |
| `start(configObject / null)` | --- | Object | Starting the server with/without the configuration object |
| `loadConfigFile(path)` | --- | String | Initializing configuration from file |
| `setConfig(configObject)` | --- | Object | Setting a configuration from an object |
| `setRootPath(path)` | ./ | String | Set root directory |
| `setLogPath(path)` | ./ | String | Set a directory of the log file |
| `setPort(port)` | 8080 | Number | Set the server port |
| `setSecure(secureObject)` | --- | Object | SSL configuration object with paths to files: `{key:'',cert:''}` |
| `setWorkersCount(workerNumber)` | 1 | Number | Number of instances for load balancing. If number more than 1, uses node.js cluster | 
| `setTimeout(timeout)` | 60(sec) | Number | Timeout in seconds, then user will see `{error: 'TIMEOUT'}` **Note, execution of the method is not interrupted** |
| `setDefaultHeaders(headersObject)` | --- | Object | An object with default headers, which have to be added to the every response | 
| `setRestartOnChange([true / false])` | false | Boolean | Boolean value determine is server will restart automatically when files in the folder with `modules` was changed |
| `setSkipDbWarning([true / false])` | false | Boolean | Skip warning in console if useDals not defined in config |
| `setDebugMode([true / false])` | false | Boolean | Allow to display `log.d` in console |
| `setDisableNagleAlgoritm([true / false])` | false | Boolean | Flag to disable Nagle algoritm for all connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm) |
| `setInstantShutdownDelay(timeout)` | 1500(ms) | Number | Delay in milliseconds after server will shutdown on process SIGINT or SIGTERM signal, or process message: shutdown | 
| `setRetryAter(timeout)` | 10(sec) | Number | Time in seconds for Retry-After response header with server HTTP 503 status. Works until `config.instantShutdownDelay` |
| `addEmailSender(emailSenderName, emailSenderConfig)` | --- |  String, Object | Add an email sender. Priority over the last folder. [How to create](#create-email-sender) |
| `addDalPath(path, [path, [path]])` | --- |  String | Add path to DAL's(Data Access Layer) modules. Priority over the last added path | 
| `addDal(dalName, dalConfig)` | --- | String, Object | The configuration(dalConfig) for dal module(dalName) to be used. Out of the box is available redis(for use specify `redis, {}`), mysql(for use specify `mysql, {}` and default `dalConfig` will be `{host: '127.0.0.1',user: 'root'}`), postgress(for use specify `postgress, {}` and default `dalConfig` will be `{host: '127.0.0.1',user: 'root'}`). For configure redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties), mysql [see here](https://github.com/mysqljs/mysql#connection-options), postgres [see here](https://github.com/brianc/node-postgres/wiki/Client#parameters) |
| `addMiddlewarePath(path, [path, [path]])` | --- |  String, ... | Add path to middleware modules. Priority over the last added path. [How to create](#create-middleware) |
| `setMiddlewareOrder(middlwareName, middlwareName)` | --- |  String or Array[Strings] |  An array(or arguments) with ordered names of middlewares |
| `setMiddlewareTimeout(timeout)` | 10(sec) |  Number | Timeout in second, then user will see `{error: 'TIMEOUT'}` **Note, execution of the runned middlewares is not interrupted** |
| `addModulesPath(path, [path, [path]])` | ./modules |String, ... | Add path to modules. Priority over the last added path. (Default directory is './modules' unless otherwise specified.) [How to create](#module-creation) |
| `addI18nPath(path, [path, [path]])` | ./i18n | String, ... | Add path to localization files. Priority over the last added path. (Default directory is './i18n' unless otherwise specified.) [How to create](#localization) |
| `addServePath(path, [path, [path]])` | --- | String, ... | Add path to Serving Static Content. Priority over the last added path | 
| `addViewPath(path, [path, [path]])` | ./files |  String, ... | Folders with files, which you can be uses as templates, or returned through the api(by using `request.getView`). Priority over the last folder. (Default directory is './files' unless otherwise specified.) | 

### How to use
```js
let server = require('interlayer').server();
server.setRootPath(__dirname);
server.loadConfigFile('config.json');
server.start();
```

---

## Module creation
Example of modules/myModule.js
```js
const app = require('interlayer').module();
let log = app.getLog('myModuleId');
app.addMeta({asJson: true});
app.addInit((request, requestCallback)=>{
    log.i('Module inited');
    requestCallback();
});

app.addMethod('myMethod', {toJson: true}, (request, requestCallback)=>{
    let fullLog = request.modifyLog(log);
    log.i('I am log without requestId but with myModuleId');
    request.log.i('I am log with requestId but without myModuleId');
    fullLog.i('I am log with requestId and with myModuleId');
    requestCallback(null, {ok: true});
});//Could be called in the path of /myModule/myMethod
```

#### Avaliable app methods
```js
const app = require('interlayer').module();
```
| Method | Property types | Description |
| --- | --- | --- |
| `getLog(name)` | String | Get the object to output messages to the console. Object of `{i:funcion, e:function, d: function, w: function, c: function}` type |
| `setMeta(metaObject)` | Object | Set the default parameters for all methods of this module. `metaObject` see below |
| `setInit(initFunction)`| Function | Set the function to initialize the module at server start. `initFunction` see below |
| `addMethod(methodUrl, [methodMeta,] methodFunction)`| String, [Object,] Function | Adds a new method with/without parameters. `methodMeta` and `methodFunction` see below |
| `setMethodInfo(methodUrl, methodMeta)`| String, Object | Sets parameters for method. `methodMeta` see below |
| `getMethod(methodUrl)`| String | Returns the method function |
| `getMethodInfo(methodUrl)`| String | Returns method parameters |

#### metaObject and methodMeta default paramerets
| Key | Type | Description |
| --- | --- | --- |
| `default = methodFunction` | Function | Module(not method) function, can be used to output HTML, Available at `/moduleUrl`. **Only for metaObject.** See `methodFunction` below |
| `html = methodFunction` | Function | Same as `default`. **Only for metaObject** |
| `find = methodFunction` | Function | The method search function is only triggered if no other methods have been processed. **Only for metaObject.** See `methodFunction` below |
| `path` | String | Changes `methodUrl` to `path` |
| `addToRoot` | Boolean | Skip `moduleUrl` and use `methodUrl` or `path` as url to method |
| `alias` | String | Alias path to method |
| `timeout` | Number | Seconds until HTTP 408(Request timeout) | 
| `disableNagleAlgoritm` | Boolean | Disable the use of Nagle's algorithm. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm) |
| `middlewareTimeout` | Number | Timeout in second, then user will see `{error: 'TIMEOUT'}` **Note, execution of the runned middlewares is not interrupted** |
| `prerun = prerunFunction` | Function | Function or link to function which will be runned before method. May be usefull for preparing request. See `prerunFunction` below |
| `toJson` | Boolean | Convert response to JSON string |
| `contentType` | String | Same as `toJson` if `contentType==json` |
| `skipRequestLog` | String | Skip request log output |
| `hidden` | Boolean | Skip method from return information while calling `request.getMethodsInfo`|

#### methodFunction(request, requestCallback):
`request`:
| Methods | Property types | Description |
| --- | --- | --- |
| `modifyLog(log)` | Object | Add to log object requestId |
| `getView(file, callback)` | String, Function | Return `file` in `callback` from paths specified in `config.views` or in `server.setViewPath()`. `callback = (error, data)` |
| `getViewSync(file)` | String | Synchronous `request.getView` | 
| `getFile(file, callback)` | String, Function | Return file ***as is***. `callback = (error, data, {'Content-type':''})` | 
| `addCookies(key, value)` | String, String | Set coockie for response | 
| `rmCookies(key)` | String | Remove coockie from responce | 
| `i18n(key[, defaultValue])` | String[, String] | Return translate for `key` or return `defaultValue`| 
| `getMethodsInfo(showHidden)` | Boolean | Returns all methods (except hidden methods if showHidden is not specified) | 
| `lockShutdown()` | --- | Blocks the termination of the process until the request is completed |
| `unlockShutdown()` | --- | Unlock the termination of the process |
| `getResponse()` | --- | Returns the original responce,  |
| `error(text)` | String | Returns 503 http code |
| `end(text[, code[, headers[, type]]])` | String[, Number[, Object[, String]]] | Returns `code` http code with `text`(as binary if `type==bin`) and `headers`| 

| Property | Type | Description |
| --- | --- | --- |
| `config` | Object | An object of configuration specified at start of server |
| `ip` | String | Client ip adress |
| `url` | String | Request url |
| `path` | String | Request path(module/method) |
| `method` | String | Uppercased type of request - POST|GET|... |
| `isPost` | Boolean | true|false |
| `params` | Object | An object of parsed GET params |
| `post` | Object | An object of parsed POST params |
| `cookies` | Object | An object of parsed cookies |
| `headers` | Object | An object of request headers |
| `DAL` | Object | An object with DALs, which was initialized by `config.useDals` or `server.addDal()` |
| `mail` | Object | An object with mail senders, which was initialized by `config.useEmails` or `server.addEmailSender()` |
| `id` | String | requestId |
| `log` | Object | The same as `global.logger.create(moduleID)`, but with requestID included(not include moduleID) |
| `helpers` | Object | See below |

#### request.helpers
| Methods | Property types | Description |
| --- | --- | --- |
| `helpers.generateId()` | --- | Geneate 8-character identifier(a-zA-Z0-9) |
| `helpers.toJson(obj)` | * | Convert `obj` to JSON string |
| `helpers.clearObj(obj, toRemove)` | Object, Array | Delete parameters of `obj` from `toRemove` array of strings |
| `helpers.isBoolean(val)` | * | Check is `val` string is Boolean(true|false) |
| `helpers.JSV(json, schema, envId)` | Object, Object, String | [See here] https://www.npmjs.com/package/JSV. Create environment with `envId` and call `validate` with `json` and `schema`
| `helpers.mime()` | Object | return mime type by file extension or `fallback` or 'application/octet-stream' |

#### prerunFunction(request, moduleMeta, requestCallback)
`request` same as in 

#### initFunction(simpleRequest)
Defenition of `simpleRequest` [see here](https://github.com/aidevio/interlayer/blob/c350c45f21f5c02678e3314d23eed31e0cab0586/system/init.js#L440)

#### added global property
`global.logger` - Object to creat log with `global.logger.create(logName)` were `logName` is String. See Features below
`global.intervals` Object with methods:
| Methods | Property types | Description |
| --- | --- | --- |
| `add(function, timeout)` | Function, Number | Return `key` |
| `del(key)` | String | Remove by `key` |
| `disable(key, flag)` | String, Boolean | Disable/Enable by `key` and `flag` |

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
#### Use dals:**
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

#### Use email senders
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
