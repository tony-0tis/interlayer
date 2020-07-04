let log = global.logger.create('__INIT');
let fs = require('fs');
let pathMod = require('path');
let url = require('url');
let qs = require('querystring');
let async = require('async');

let DAL = require('./DAL');
let Emails = require('./mail');

let helper = require('./index.js');

let DAL_connections;
let modules = {};
let middlewares = [];
let emailSenders;
let serve = null;

let initObject = {
  pools: {},
  config: {},
  paths: {},
  init(paths, config){
    this.paths = paths;
    this.config = config;

    this.initDALs();
    this.initModules();
    this.initMiddlewares();
    this.initI18n();
    this.initEmailSenders();
    this.initServe();
    return this;
  },
  getModule(module){
    if(modules[module]){
      return modules[module];
    }

    module = module.replace(/\/$/, '').replace(/^\//, '');

    if(modules[module]){
      return modules[module];
    }

    let subs = module.split('/');
    if(subs.length > 1){
      if(modules[subs[0] + '/*']){
        return modules[subs[0] + '/*'];
      }
    }

    return false;
  },

  reconstructRequest(request, response){
    let requestObject = {
      config: this.config,
      DAL: DAL_connections,
      mail: emailSenders,

      id: helper.generateId(),
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
      if(helper.isBoolean(requestObject[i])){
        requestObject[i] = Boolean(requestObject[i]);
      }
    }

    if(requestObject.params.callback){
      requestObject.jsonpCallback = requestObject.params.callback;
      delete requestObject.params.callback;
    }

    if(requestObject.headers.cookie){
      requestObject.headers.cookie.split(';').forEach(cookie=>{
        let parts = cookie.split('=');
        requestObject.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
      });
    }

    Object.keys(helper.defReqFuncs).forEach(k=>{
      requestObject[k] = helper.defReqFuncs[k];
    });

    //modifyLog defined in defReqFuncs
    requestObject.log = requestObject.modifyLog(global.logger.create());


    let originalResposeEnd;
    requestObject.lockShutdown();

    requestObject.getResponse = ()=>{
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
        response.end(...args);
        delete response.end;

        clearRequest();
      };

      requestObject.responseFree = true;
      return response;
    };

    requestObject.getRequest = ()=>request;

    requestObject.end = (text='', code=200, headers={'Content-Type': 'text/html; charset=utf-8'}, type='text')=>{
      requestObject.unlockShutdown();
      if(!requestObject || requestObject.ended){
        requestObject = undefined;
        clearRequest();
        return;
      }

      requestObject.ended = true;

      if(type == 'bin'){
        text = Buffer.from(text, 'binary');
        headers['Content-Length'] = text.length;
      }
      else{
        let asObject = false;
        if(typeof text == 'object' && text instanceof Buffer != true && text !== null){
          try{
            text = JSON.stringify(text);
          }catch(e){}
        }
        else if(typeof text == 'function' || typeof text == 'boolean'){
          text = text.toString();
          asObject = true;
        }
        else if(typeof text == 'undefined' || typeof text == 'object' && text === null){
          text = String(text);
          asObject = true;
        }
        else if(typeof text == 'number'){
          text = text.toString();
        }
        else if(typeof text == 'symbol'){
          text = '';
        }

        headers['Content-Length'] = Buffer.from(text).length;

        if(requestObject.jsonpCallback){
          if(headers['Content-Type'] == 'application/json' || asObject){
            text = `${requestObject.jsonpCallback}(${text});`;
          }
          else{
            text = `${requestObject.jsonpCallback}("${text}");`;
          }
        }
      }

      if(this.config.defaultHeaders){
        for(let i in this.config.defaultHeaders){
          if(!this.config.defaultHeaders.hasOwnProperty(i)){
            continue;
          }
          
          headers[i] = this.config.defaultHeaders[i];
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

      if(!text){
        code = 204;
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

    var clearRequest = ()=>{
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
        Object.keys(helper.defReqFuncs).forEach(k=>{
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
  },

  middleware(request, moduleMeta, cb){
    if(!middlewares.length){
      return cb();
    }

    let count = 0;
    async.whilst(
      cb=>cb(null, count < middlewares.length),
      cb=>{
        let middleware = middlewares[count];
        count++;
        
        if(middleware.triggers['*']){
          middleware.triggers['*'](request, moduleMeta, cb);
          return;
        }

        let funcs = Object.keys(middleware.triggers).reduce((res, trigger)=>{
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
  },

  serve(request, cb){
    if(!serve){
      return cb();
    }

    log.d('Try to serve', request.path);
    let paths = [...serve];
    let done = false;
    async.whilst(
      cb=>cb(null, !done),
      cb=>{
        if(paths.length == 0){
          done = true;
          return cb();
        }

        let p = paths.shift();
        log.d('check path', pathMod.join(p, request.path));
        
        if(!p){
          return cb();
        }
        
        let stat;
        try{
          stat = fs.lstatSync(pathMod.join(p, request.path));
        }catch(e){
          log.d('No requested file', pathMod.join(p, request.path));
          return cb();
        }

        if(stat && stat.isDirectory()){
          if (['\\', '/'].indexOf(request.path.slice(-1)) == -1){
            request.path += '/';
          }
          
          request.path += 'index.html';
        }
        
        request.getFile(pathMod.join(p, request.path), (err, res, headers)=>{
          if(err){
            log.i(pathMod.join(p, request.path), err, res, headers);
            return cb();
          }

          done = true;
          cb(null, [res, headers]);
        });
      },
      (err, res)=>{
        if(err){
          return cb(err);
        }

        if(!res){
          return cb('NOT FOUND', null, 404);
        }

        cb(null, res[0], 200, res[1]);
      }
    );
  },

  // ### INITS
  initServe(){
    if(this.paths.serve && this.paths.serve.length){
      serve = this.paths.serve;
      log.i('Server start serve dirs', serve);
    }
  },

  initDALs(){
    DAL_connections = DAL.init(this.paths, this.config);
    return DAL_connections;
  },

  initModules(){
    let inits = {};
    this.paths.modules.forEach(path=>{
      let pathModules = fs.readdirSync(path);

      let getUrl = (moduleName, methodName, module, meta)=>{
        if(module.addToRoot || meta.addToRoot){
          return methodName;
        }

        if(meta.path && meta.path.match(helper.pathCheck)){
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
          if(module.__moduleInfo){
            module = module.__moduleInfo;
          }

          if(module.__init){
            inits[file] = module.__init;
          }

          if(module.__meta){
            if(module.__meta.default){
              modules[moduleName] = {
                func: module.__meta.default,
                meta: module.__meta
              };
            }
            if(module.__meta.html){
              modules[moduleName] = {
                func: module.__meta.html,
                meta: module.__meta
              };
            }
            if(module.__meta.find){
              modules[moduleName + '/*'] = {
                func: module.__meta.find,
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
            helper.infoApi.push(moduleApi);
          }

          module = null;
        }
        catch(err){
          log.e('Error in module ' + path + '/' + file, err, err.stack);
        }
      }
    });

    log.d('server methods accessible from the outside');
    Object.keys(modules).forEach(m=>{
      log.d(`\t\t\t${m}`);
    });

    let context = {
      url: '',
      headers: {},
      DAL: DAL_connections,
      config: this.config,
    };

    Object.keys(helper.defReqFuncs).forEach(k=>{
      context[k] = helper.defReqFuncs[k];
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
  },

  initMiddlewares(){
    let inits = {};
    this.paths.middleware.forEach(path=>{
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

            middlewareObject.triggers = middleware.triggers.reduce((res, cur)=>{
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

    if(this.config.middlewareOrder){
      for(let i in this.config.middlewareOrder){
        if(!this.config.middlewareOrder.hasOwnProperty(i)){
          continue;
        }

        let ind = -1;
        for(let j in middlewares){
          if(middlewares[j].name == this.config.middlewareOrder[i]){
            ind = j;
            break;
          }
        }

        if(ind < 0){
          log.e('middleware specified in config.middlewareOrder has not been initialized', middlewares, this.config.middlewareOrder[i]);
          continue;
        }

        middlewares.splice(i, 0, middlewares.splice(ind, 1).pop());
      }
    }
  },

  initI18n(){
    this.paths.i18n.forEach(path=>{
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

          helper.i18n[file.replace('.json', '')] = JSON.parse(fs.readFileSync(pathMod.join(path, file)));
        }
        catch(err){
          log.e('Error in i18n ' + path + '/' + file, err, err.stack);
        }
      }
    });
  },

  initEmailSenders(){
    emailSenders = Emails.init(this.paths, this.config);
  }
};
module.exports = initObject;

global.intervals = {
  _si: setInterval(()=>{
    for(let i in global.intervals._funcs){
      if(!global.intervals._funcs.hasOwnProperty(i)){
        continue;
      }

      if(global.intervals._funcs[i].runafter && Date.now() < global.intervals._funcs[i].runafter){
        continue;
      }

      if(global.intervals._funcs[i].runafter){
        global.intervals._funcs[i].runafter = Date.now() + global.intervals._funcs[i].t * 1000;
      }

      if(global.intervals._funcs[i].disabled){
        continue;
      }

      global.intervals._funcs[i].f(()=>{
        global.intervals.del(global.intervals._funcs[i].key);
      });
    }
  }, 1000),
  _funcs: [],
  add: function(f, t){
    let key = Math.random() * Date.now();
    this._funcs.push({
      key: key,
      f: f,
      t: t,
      runafter: t ? Date.now() + t * 1000 : null
    });
    return key;
  },
  del: function(key){
    let ind = this._funcs.reduce((r,f,ind)=>{
      if(f.key == key){
        r = ind;
      }
      return r;
    }, -1);
    this._funcs.splice(ind, 1);
    return key;
  },
  disable: function(key, val){
    this._funcs.map(f=>{
      if(f.key == key){
        if(val == false){
          f.disabled = false;
        }
        else{
          f.disabled = true;
        }
      }
    });
  }
};