let log = global.logger.create('INIT');
let fs = require('fs');
let pathMod = require('path');
let url = require('url');
let qs = require('querystring');
let async = require('async');

let DAL = require('./DAL');
let Emails = require('./mail');

let helpers = require('./helpers');

let DAL_connections;
let modules = {};
let middlewares = [];
let emailSenders;
let serve = null;

module.exports = (paths, config)=>{
  exports.paths = paths;
  exports.config = config;

  exports.initDALs();
  exports.initModules();
  exports.initMiddlewares();
  exports.initI18n();
  exports.initEmailSenders();
  exports.initServe();
  return exports;
};

exports.pools = {};
exports.config = {};
exports.paths = {};

exports.getModule = module => modules[module] || modules[module.replace(/\/$/, '').replace(/^\//, '')];

exports.reconstructRequest = (request, response) => {
  let requestObject = {
    config: exports.config,
    DAL: DAL_connections,
    mail: emailSenders,

    id: helpers.generateId(),
    url: request.url,
    path: url.parse(request.url).pathname.substring(1),
    method: request.method,
    isPost: request.method == 'POST',
    headers: JSON.parse(JSON.stringify(request.headers)),
    langs: (request.headers['accept-language'] || 'en').match(/(\w{2}(-\w{2})?)/g),
    ip: request.headers['x-forwarded-for'] ||
      request.connection.remoteAddress ||
      request.socket && request.socket.remoteAddress ||
      request.connection.socket && request.connection.socket.remoteAddress,
    responseCookies: {},
    cookies: {},
    params: {},
    post: {}
  };

  requestObject.params = qs.parse(url.parse(requestObject.url).query);
  for(let i in requestObject.params){
    if(helpers.isBoolean(requestObject[i])){
      requestObject[i] = Boolean(requestObject[i]);
    }
  }

  if(requestObject.params.callback){
    requestObject.jsonpCallback = requestObject.params.callback;
    delete requestObject.params.callback;
  }

  if(requestObject.headers.cookie){
    requestObject.headers.cookie.split(';').forEach(cookie => {
      let parts = cookie.split('=');
      requestObject.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }

  Object.keys(helpers.defaultRequestFuncs).map(k => {
    requestObject[k] = helpers.defaultRequestFuncs[k];
  });

  //modifyLog defined in defaultRequestFuncs
  requestObject.log = requestObject.modifyLog(global.logger.create());


  let originalResposeEnd;
  requestObject.lockShutdown();

  requestObject.getResponse = () => {
    originalResposeEnd = response.end;
    response.end = function(...args){
      requestObject.unlockShutdown();
      if(!requestObject || requestObject.ended){
        if(requestObject){
          clearRequest();
        }

        requestObject = undefined;
        throw 'FORBIDEN';
      }

      requestObject.ended = true;
      response.end = originalResposeEnd;
      originalResposeEnd = undefined;
      response.end(args);
      delete response.end;

      clearRequest();
    };

    requestObject.responseFree = true;
    return response;
  };

  requestObject.getRequest = () => request;

  requestObject.end = (text='', code=200, headers={'Content-Type': 'text/html; charset=utf-8'}, type='text') => {
    requestObject.unlockShutdown();
    if(!requestObject || requestObject.ended){
      requestObject = undefined;
      clearRequest();
      return;
    }

    requestObject.ended = true;

    if(!text){
      code = 204;
    }

    if(type == 'bin'){
      headers['Content-Length'] = Buffer.from(text, 'binary').length;
    }
    else{
      text = text.toString().replace(new RegExp('%\\$.*%', 'g'), '');

      if(requestObject.jsonpCallback){
        if(headers['Content-Type'] == 'application/json'){
          text = requestObject.jsonpCallback + '(\'' + text + '\');';
        }
        else{
          text = requestObject.jsonpCallback + '("' + text + '");';
        }
      }

      headers['Content-Length'] = Buffer.from(text).length;
    }

    if(exports.config.defaultHeaders){
      for(let i in exports.config.defaultHeaders){
        if(!exports.config.defaultHeaders.hasOwnProperty(i)){
          continue;
        }
        
        headers[i] = exports.config.defaultHeaders[i];
      }
    }

    if(requestObject.responseCookies){
      let cookies = [];
      let expires = new Date();
      expires.setDate(expires.getDate() + 5);
      
      for(let i in requestObject.responseCookies){
        if(!requestObject.responseCookies.hasOwnProperty(i)){
          continue;
        }
        
        cookies.push(i + '=' + encodeURIComponent(requestObject.responseCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
      }
      
      headers['Set-Cookie'] = cookies;
    }

    response.writeHead(code, headers);
    
    if(type == 'bin'){
      response.write(text, 'binary');
    }
    else{
      response.write(text);
    }

    response.end();

    clearRequest();
  };

  var clearRequest = () => {
    if(requestObject){
      //objects
      delete requestObject.config;
      delete requestObject.DAL;
      delete requestObject.mail;
      delete requestObject.log;

      //current request functions
      delete requestObject.getResponse;
      delete requestObject.getRequest;
      delete requestObject.end;

      // default functions
      Object.keys(helpers.defaultRequestFuncs).map(k => {
        delete requestObject[k];
      });
    }

    if(originalResposeEnd){
      response.end = originalResposeEnd;
    }

    requestObject.cleared = true;

    originalResposeEnd = undefined;
    requestObject = undefined;
    clearRequest = undefined;
    request = undefined;
  };

  return requestObject;
};

exports.middleware = (request, moduleMeta, cb) => {
  if(!middlewares.length){
    return cb();
  }

  let count = 0;
  async.whilst(
    () => {
      return count < middlewares.length;
    },
    (cb) => {
      let middleware = middlewares[count];
      count++;
      if(middleware.triggers['*']){
        middleware.triggers['*'](request, moduleMeta, cb);
        return;
      }

      let funcs = Object.keys(middleware.triggers).reduce((res, trigger) => {
        let run = false;
        let isMeta = trigger.match(/^meta\./);
        let isRequest = trigger.match(/^request\./);
        if(isMeta || isRequest){
          let p = trigger.split('.').splice(1);
          let path = isMeta ? moduleMeta : request;
          for(let i in p){
            if(!p.hasOwnProperty(i)){
              continue;
            }
            if(path[p[i]]){
              path = path[p[i]];
              run = true;
            }
            else{
              run = false;
              break;
            }
          }
        }
        if(run){
          res.push(middleware.triggers[trigger].bind({}, request, moduleMeta));
        }
        return res;
      }, []);
      async.series(funcs, cb);
    },
    cb
  );
};

exports.serve = (request, cb) => {
  if(!serve){
    return cb();
  }

  log.d('Try to serve', request.path);
  let paths = [...serve];
  let done = false;
  async.whilst(
    () => !done,
    (cb) => {
      if(paths.length == 0){
        done = true;
        return cb();
      }
      let p = paths.shift();
      log.d('check path', p);
      if(!p){
        return cb();
      }
      if(fs.lstatSync(pathMod.join(p, request.path)).isDirectory()){
        request.path += 'index.html';
      }
      request.getFile(pathMod.join(p, request.path), (err, res, headers) => {
        if(err){
          log.d(pathMod.join(p, request.path), err, res, headers);
          return cb();
        }

        done = true;
        cb(null, [res, headers]);
      });
    },
    (err, res) => {
      if(err){
        return cb(err);
      }

      if(!res){
        return cb('NOT FOUND', null, 404);
      }

      cb(null, res[0], 200, res[1]);
    }
  );
};

// ### INITS
exports.initServe = () => {
  if(exports.paths.serve && exports.paths.serve.length){
    serve = exports.paths.serve;
    log.i('Server start serve dirs', serve);
  }
};

exports.initDALs = () => {
  DAL_connections = DAL.init(exports.paths, exports.config);
  return DAL_connections;
};

exports.initModules = () => {
  let inits = {};
  exports.paths.modules.forEach(path => {
    let pathModules = fs.readdirSync(path);

    let getUrl = (moduleName, methodName, module, meta) => {
      if(module.addToRoot || meta.addToRoot){
        return methodName;
      }

      if(meta.path && meta.path.match(helpers.pathCheck)){
        methodName = meta.path;
      }

      return moduleName + '/' + methodName;
    };

    for(let file of pathModules){
      try{
        let isDir = false;
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
          continue;
        }

        if(fs.lstatSync(path + '/' + file).isDirectory()){
          if(!fs.accessSync(path + '/' + file + '/index.js')){
            if(!fs.statSync(path + '/' + file + '/index.js').isFile()){
              continue;
            }
          }

          isDir = true;
        }

        if(!file.match(/^.*\.js$/) && !isDir){
          continue;
        }

        let moduleName = file.replace('.js', '');
        let module = require(pathMod.resolve(path) + '/' + file + (isDir ? '/index.js' : ''));//eslint-disable-line global-require

        if(module.__init){
          inits[file] = module.__init;
        }

        if(module.__meta){
          if(module.__meta.html){
            modules[moduleName] = {
              func: module.__meta.html,
              meta: module.__meta
            };
          }
        }
        let moduleApi = Object.assign({name: moduleName}, module.__meta, {methods: []});
        for(let m in module){
          if(m.indexOf('__') === 0){
            continue;
          }

          if(m.indexOf('_') === 0){
            let methodMeta = module[m];
            let methodName = m.substring(1);

            if(!module[methodName]){
              log.e('module', moduleName, 'Method', methodName, 'in file', file, 'not found');
              continue;
            }

            let method = {
              func: module[methodName],
              meta: Object.assign({}, module.__meta || {}, methodMeta),
              definedIn: file
            };

            let methodInfo = Object.assign({}, method.meta);

            methodName = getUrl(moduleName, methodName, module, method.meta);

            if(modules[methodName]){
              log.e('module', moduleName, 'Method', methodName, 'in file', file, 'IS DEFINED IN', modules[methodName].definedIn);
              continue;
            }

            modules[methodName] = method;
            methodInfo.url = methodName;
            moduleApi.methods.push(methodInfo);

            let aliasURL = methodMeta.alias;
            if(aliasURL){
              aliasURL = getUrl(moduleName, aliasURL, module, method.meta);
              if(modules[aliasURL]){
                log.e('module', moduleName, 'Method', aliasURL, 'in file', file, 'IS DEFINED IN', modules[aliasURL].definedIn);
                continue;
              }

              modules[aliasURL] = method;
              methodInfo.alias = aliasURL;
            }
          }
        }
        if(moduleApi.methods.length){
          helpers.infoApi.push(moduleApi);
        }
        module = null;
      }
      catch(err){
        log.e('Error in module ' + path + '/' + file, err, err.stack);
      }
    }
  });

  log.d('server methods accessible from the outside\n', Object.keys(modules));

  let context = {
    url: '',
    headers: {},
    DAL: DAL_connections,
    config: exports.config,
  };

  Object.keys(helpers.defaultRequestFuncs).map(k => {
    context[k] = helpers.defaultRequestFuncs[k];
  });

  for(let ii in inits){
    if(!inits.hasOwnProperty(ii)){
      continue;
    }

    try{
      inits[ii](context, function(){});
    }catch(e){
      log.e('__init()', ii, e);
    }
  }
};

exports.initMiddlewares = () => {
  let inits = {};
  exports.paths.middleware.forEach(path => {
    let pathMiddleware = fs.readdirSync(path);

    for(let file of pathMiddleware){
      try{
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
          continue;
        }

        if(fs.lstatSync(path + '/' + file).isDirectory()){
          continue;
        }

        let middleware = require(pathMod.resolve(path) + '/' + file);//eslint-disable-line global-require

        if(middleware.__init){
          inits[file] = middleware.__init;
        }

        let middlewareObject = {
          name: file.replace('.js', '')
        };

        if(!middleware.triggers){
          if(!middleware.run){
            log.e('middleware', file, 'have no property `triggers` and method `run`');
            continue;
          }

          middlewareObject.triggers = {
            '*': middleware.run
          };
        }
        else if(Array.isArray(middleware.triggers)){
          if(!middleware.run){
            log.e('middleware', file, 'have no method `run`');
            continue;
          }

          middlewareObject.triggers = middleware.triggers.reduce((res, cur) => {
            res[cur] = middleware.run;
            return res;
          }, {});
        }
        else if(typeof middleware.triggers == 'object'){
          middlewareObject.triggers = {};
          for(let t in middleware.triggers){
            if(typeof middleware.triggers[t] == 'function'){
              middlewareObject.triggers[t] = middleware.triggers[t];
              continue;
            }

            if(!middleware[middleware.triggers[t]]){
              log.e('in middleware', file, 'trigger', t, 'linked to undefined method');
              continue;
            }

            if(typeof middleware[middleware.triggers[t]] != 'function'){
              log.e('in middleware', file, 'trigger', t, 'linked to non function', middleware.triggers[t]);
              continue;
            }

            middlewareObject.triggers[t] = middleware[middleware.triggers[t]];
          }
        }

        middlewares.push(middlewareObject);

        middleware = null;
      }
      catch(err){
        log.e('Error in middleware ' + path + '/' + file, err, err.stack);
      }
    }
  });

  if(exports.config.middlewareOrder){
    for(let i in exports.config.middlewareOrder){
      if(!exports.config.middlewareOrder.hasOwnProperty(i)){
        continue;
      }

      let ind = -1;
      for(let j in middlewares){
        if(middlewares[j].name == exports.config.middlewareOrder[i]){
          ind = j;
          break;
        }
      }

      if(ind < 0){
        log.e('middleware specified in config.middlewareOrder has not been initialized', middlewares, exports.config.middlewareOrder[i]);
        continue;
      }

      middlewares.splice(i, 0, middlewares.splice(ind, 1).pop());
    }
  }
};

exports.initI18n = () => {
  exports.paths.i18n.forEach(path => {
    let pathI18n = fs.readdirSync(path);

    for(let file of pathI18n){
      try{
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
          continue;
        }

        if(fs.lstatSync(path + '/' + file).isDirectory()){
          continue;
        }

        if(file.split('.').pop() != 'json'){
          log.w('In catalog with i18n files founded non json file', file);
          continue;
        }

        helpers.i18n[file.replace('.json', '')] = JSON.parse(fs.readFileSync(pathMod.join(path, file)));
      }
      catch(err){
        log.e('Error in i18n ' + path + '/' + file, err, err.stack);
      }
    }
  });
};

exports.initEmailSenders = () => {
  emailSenders = Emails.init(exports.paths, exports.config);
};
