let fs = require('fs');
let pathMod = require('path');

let helper = require('./index.js');

let modulesInits = {};
let log;
let DAL;
let Emails;
exports.init = ()=>{
  log = global.logger.create('__INIT');
  DAL = require('./DAL')
  Emails = require('./mail')

  exports.initDALs();
  exports.initModules();
  exports.initMiddlewares();
  exports.initI18n();
  exports.initEmailSenders();
  exports.initServe();
};

exports.runInits = (websocket)=>{
  let context = {
    url: '',
    headers: {},
    DAL: helper.DAL_connections,
    config: helper.config,
    websocket
  };

  Object.keys(helper.defReqFuncs).forEach(k=>{
    context[k] = helper.defReqFuncs[k];
  });

  for(let ii in modulesInits){
    if(!modulesInits.hasOwnProperty(ii)){
      continue;
    }

    try{
      modulesInits[ii](context, function(){});
    }catch(e){
      log.e('__init()', ii, e);
    }
  }
}

// ### INITS
exports.initServe = ()=>{
  if(helper.config.serve && helper.config.serve.length){
    helper.servePaths = helper.config.serve;
    log.i('Server start serve dirs', helper.servePaths);
  }
};

exports.initDALs = ()=>{
  helper.DAL_connections = DAL.init(helper.config, helper.config);
  return helper.DAL_connections;
};

exports.initModules = ()=>{
  helper.config.modules.forEach(path=>{
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
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1) continue;

        if(fs.lstatSync(path + '/' + file).isDirectory()){
          if(!fs.accessSync(path + '/' + file + '/index.js')){
            if(!fs.statSync(path + '/' + file + '/index.js').isFile()){
              continue;
            }
          }

          isDir = true;
        }

        if(!file.match(/^.*\.js$/) && !isDir) continue;

        let moduleName = file.replace('.js', '');
        let curModule = require(pathMod.resolve(path) + '/' + file + (isDir ? '/index.js' : ''));//eslint-disable-line global-require
        if(curModule.__moduleInfo){
          curModule = curModule.__moduleInfo;
        }

        if(curModule.__init){
          modulesInits[file] = curModule.__init;
        }

        if(curModule.__meta){
          if(curModule.__meta.default){
            helper.modules[moduleName] = {
              func: curModule.__meta.default,
              meta: curModule.__meta
            };
          }
          if(curModule.__meta.html){
            helper.modules[moduleName] = {
              func: curModule.__meta.html,
              meta: curModule.__meta
            };
          }
          if(curModule.__meta.find){
            helper.modules[moduleName + '/*'] = {
              func: curModule.__meta.find,
              meta: curModule.__meta
            };
          }
        }

        let moduleApi = Object.assign({name: moduleName}, curModule.__meta, {methods: []});
        for(let m in curModule){
          if(m.indexOf('__') === 0) continue;

          if(m.indexOf('_') === 0){
            let methodMeta = curModule[m];
            let methodName = m.substring(1);

            if(!curModule[methodName]){
              log.e('module', moduleName, 'Method', methodName, 'in file', file, 'not found');
              continue;
            }

            let method = {
              func: curModule[methodName],
              meta: Object.assign({}, curModule.__meta || {}, methodMeta),
              definedIn: file
            };

            let methodInfo = Object.assign({}, method.meta);

            methodName = getUrl(moduleName, methodName, curModule, method.meta);

            if(helper.modules[methodName]){
              log.e('curModule', moduleName, 'Method', methodName, 'in file', file, 'IS DEFINED IN', helper.modules[methodName].definedIn);
              continue;
            }

            helper.modules[methodName] = method;
            methodInfo.url = methodName;
            moduleApi.methods.push(methodInfo);

            let aliasURL = methodMeta.alias;
            if(aliasURL){
              aliasURL = getUrl(moduleName, aliasURL, curModule, method.meta);
              if(helper.modules[aliasURL]){
                log.e('curModule', moduleName, 'Method', aliasURL, 'in file', file, 'IS DEFINED IN', helper.modules[aliasURL].definedIn);
                continue;
              }

              helper.modules[aliasURL] = method;
              methodInfo.alias = aliasURL;
            }
          }
        }

        if(moduleApi.methods.length){
          helper.infoApi.push(moduleApi);
        }

        curModule = null;
      }
      catch(err){
        log.e('Error in module ' + pathMod.join(path + '/' + file), err, err.stack);
      }
    }
  });

  log.d('server methods accessible from the outside');
  Object.keys(helper.modules).forEach(m=>{
    log.d(`\t\t\t${m}`);
  });
};

exports.initMiddlewares = ()=>{
  helper.config.middleware.forEach(path=>{
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
          modulesInits[file] = middleware.__init;
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

        helper.middlewares.push(middlewareObject);

        middleware = null;
      }
      catch(err){
        log.e('Error in middleware ' + path + '/' + file, err, err.stack);
      }
    }
  });

  if(helper.config.middlewareOrder){
    for(let i in helper.config.middlewareOrder){
      if(!helper.config.middlewareOrder.hasOwnProperty(i)){
        continue;
      }

      let ind = -1;
      for(let j in helper.middlewares){
        if(helper.middlewares[j].name == helper.config.middlewareOrder[i]){
          ind = j;
          break;
        }
      }

      if(ind < 0){
        log.e('middleware specified in config.middlewareOrder has not been initialized', helper.middlewares, helper.config.middlewareOrder[i]);
        continue;
      }

      helper.middlewares.splice(i, 0, helper.middlewares.splice(ind, 1).pop());
    }
  }
};

exports.initI18n = ()=>{
  helper.config.i18n.forEach(path=>{
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
};

exports.initEmailSenders = ()=>{
  helper.emailSenders = Emails.init(helper.config, helper.config);
};