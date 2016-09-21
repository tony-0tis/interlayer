# interlayer
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
* in built-in redis DAL implimented smart pool of connections
* you can localize your templates and use localisation varibles for customize api responses
* it is possible to use your middleware modules to implement authorization checks
#### Future
* add file upload
* add the ability to use the add-ons for each request, such as preauthorization

### Installation
```js
npm install --save interlayer
```	

### How to use
Your project tree example
* /dals
    * [nameofdal.js](#example-of-dalsnameofdaljs)
* /files
    * index.html
    * index.js
* /middleware
    * [session.js](#example-of-middlewaresessionjs)
* /modules
    * [myModule.js](#example-of-modulesmymodulejs)
* /node_modules
    * /interlayer
* [index.js](#example-of-indexjs)

##### Example of index.js
```js
let interlayer = require('interlayer');
let server = new interlayer();
server.addModulesPath('modules');
let config = {
    useDals: ['redis'],
    port: 80
};
server.init(config);
```	

##### Methods
* `server.addModulesPath('mymodules');` - Add the path to the folder with your modules. (_The folder **mymodules** must be in the same folder where is called `server.init(config);` or you can type absolute path_)  [How to create](#create-module)
* `server.addDalsPath('dalPath');` - Add the path of the folder with dal. (_The folder **dalPath** must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal)
* `server.init(config);` - start server. Configuration settings are specified [below](#configuration)

##### Configuration:
`~~Config~~` object properties
| Property | Sever version | Default | Example | Description |
| -------- | ------------- | ------- | ------- | ----------- |
| logPath | >=0.0.3 | ./ | /var/logs/myApp/ | path where will be created `logs.log` file |
| port | >=0.0.3 | 8080 | 80 \| Number | Port of web server |
| timeout | >=0.1.8 | 60 | 600 \| Number | Timeout in seconds after which the user will be shown `{error: 'TIMEOUT'}` **Note, execution of the method is not interrupted** |
| numOfServers | >=0.0.8 | 1 | 4 \| Number of phisical processors | number of parallel servers for load balancing. If number more than 1, uses node cluster |
| useWatcher | >=0.0.8 | false | true/false | if this option is true the server will restart automatically when changing files in the folder with modules. |
| useDals | >=0.0.8 | - | ['redis'] | An array of dals which need to include. |
| useDals | >=0.1.6 | - | {redis: {host: ''}} | An object of dals which need to include. By using object settings can be specified to initialize the config for DAL. For built-in redis [see here](https://github.com/NodeRedis/node_redis#options-object-properties) |
| modules | >=0.0.3 | ['modules'] | ['mymodules'] \| ['/home/web/myserver/mymodules'] | An array of modules folders. Priority over the last folder. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-module)|
| dals | >=0.0.3 | - | ['mydals'] \| ['/home/web/myserver/mydals'] | An array of dals folders. Priority over the last folder. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-dal) |
| middleware | >=0.1.8 | - | ['mymiddleware'] | ['/home/web/myserver/mymiddleware'] | An array of folders with middlewares. Priority over the last folder. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#create-middleware) |
| middlewareOrder | >=0.1.8 | - | ['session', 'checkAuth'] | An array with ordered names of middlewares |
| middlewareTimeout | >=0.1.8 | 10 | 15 \| Number |  Timeout in seconds after which the user will be shown `{error: 'TIMEOUT'}` **Note, execution of the middlewares is not interrupted**|
| views | >=0.1.8 | ['files'] | ['myfiles'] \| ['/home/web/myserver/myfiles'] | An array of folders with files, which you can use as templates, or to return them through the api. Priority over the last folder. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_)  |
| i18n | >=0.1.8 | ['i18n'] | ['myi18n'] \| ['/home/web/myserver/myi18n'] | An array of folders with localization files. Priority over the last folder. (_The folders must be in the same folder where is called `server.init(config);` or you can type absolute path_) [How to create](#localization) |
| defaultHeaders | >=0.1.6 | - | {'Access-Control-Allow-Origin',:'*'} | An object with headers, which have to be added to every response. |
| - | - | - | - |
| ~~type~~ | >=0.0.3 <0.0.8 | ~~'server'~~ | ~~'server'/'watcher'~~ | **Deprecated!** Use `useWatcher` instead. |
| ~~initDals~~ | >=0.0.3 <0.0.8 | - | ['redis'] | **Deprecated!** Use `useDals` instead. |

##### Experimental properties
| Property | Sever version | Default | Example | Description |
| -------- | ------------- | ------- | ------- | ----------- |
| disableNagleAlgoritm | >=0.1.0 | false | true/false | Disable Nagle algoritm for connections. [Read more](https://en.wikipedia.org/wiki/Nagle%27s_algorithm) |
| debug | >=0.1.1 | false | true/false | Allow to display `log.d` in console and adding to log file |


### Create module
##### Example of modules/myModule.js
```js
let log = global.logger.create('moduleID');

// You can use this logs
log.i() // Usual log - displayed in green
log.w() // Warn - displayed in yellow
log.e() // Error - displayed in red
log.c() // Critical error - displayed in white

// format of logs [YYYY/MM/DD|HH:MM:SS.sss|tz][logtype][process.id][module identification] value
// ex: [2016/09/17|20:05:46.528|-3][I][6880][moduleID] Test log

// You can add meta, then all of its properties will be extended to all methods of the module
exports.__meta = {
    contentType: 'json'
};

// you can add initialization for module where simpleContext is Object({DAL: {... dals spicified in config.useDals}})
exports.__init = (simpleContext) => {
    // do something, example some work with using simpleContext.redis.blpop
};

// required! meta information for method, make module visible from outside. Avaliable properties see above
exports._myMethod = {
    toJson: true
};

// url will be `myModule/myMethod`. Also you can add GET params `myModule/myMethod?param1=param`
// First parametr is request-like object(properties and methods see above)
// Second parametr is callback function, given some parametrs(err, text, code, headers, type):
// * err - may be error instance or string, number, array, object
// * text - responce, may be string, number, array, object, buffer
// * code - is HTTP status code
// * headers - manual headers for response
// * type - only makes sense in the value `bin` - for responce binary data
exports.myMethod = (request, cb) => {
    let error = null;
    let responce = 'Ok';
    log.i('myMethod request');
    cb(error, response);
};
```

#### Module meta / module method meta properties
May be used in module method meta `exports._myMethod[property]` and globaly in module meta `exports.__meta[property]`
* `contentType = 'json';` || `toJson = true` - 
* `timeout = 60;` - timeout in seconds before response on hung request will be `{error: 'TIMEOUT'}`
* `addToRoot = true;` - if you specify this option then the method will be located at ~~myModule~~/`myMethod` without specifying the module name
* `skipRequestLog = true;` - if you specify this option it will disable save and display in console log information about calling this method
* `prerun = (request, moduleMeta, cb) => {}` - prerun function, like main method, takes request, and cb, but also takes module meta at the second parametr; May be usefull for preparing request.

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
* `request.getView('file.html', cb)` - *>=0.1.7* return in `cb` file(from one of folders specified in `config.view`) content `cb(null, content)` or error `cb(error)`
* `request.getViewSync('file')` - *>=0.1.7* sync version of getView. return file(from one of folders specified in `config.view`) content or *null* if file not found
* `request.addCookies(key, value)` - set cookies to response
* `request.rmCookies(key)` - delete cookies of expire cookies in responce

###### Manual responses
* `request.getResponse()` - this method return response instance
* `request.error(error)` - return an error in the response, where *error* is text of Error instance
* `request.end(text, code, headers, type)` - instead of calling callback you can return custom response where:
 * *text* is responce
 * *code* is HTTP status code
 * *headers* is object with headers
 * *type* only makes sense in the value `bin` - for binary response


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
##### Example of dals/nameofdal.js
Then you can add `nameofdal` to `config.useDals` array (ex: `config.useDals = ['nameofdal'];`)
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


### Create middleware
##### Example of middleware/session.js
```js
// init is not required
exports.init = (simpleContext) => {
    
};

// but methods is required
// request context and callback described in module
exports.checkSession = (request, moduleMeta, cb) => {
    
};
```


### Localization
##### Example of i18n/en.js
~~Note! You have to use double quotes, instead single quotes, cause it's json file~~
```json
{
    "title_error_404": "Nothing found, 404, Bill Gates site"
}
```