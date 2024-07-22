const { readdirSync, lstatSync, readFileSync, existsSync, statSync } = require('fs');
const { join, resolve } = require('path');

const { getUrlUtils } = require('./utils.js');

exports.init = config => {
  const log = global.logger('_INIT');

  return {
    dal: initDALs(config),
    mail: initEmailSenders(config),
    i18n: initI18n(config, log),
    serve: initServe(config, log),
    modules: initModules(config, log),
    middlewares: initMiddlewares(config, log)
  };
};

function initDALs(config){
  return require('./DAL').init(config, config);
}

function initEmailSenders(config){
  return require('./mail').init(config);
}

function initI18n(config, log){
  const i18n = {};

  for(const path of config.i18n){
    const files = readdirSync(path);

    for(const file of files){
      try{
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
          continue;
        }

        if(lstatSync(path + '/' + file).isDirectory()){
          continue;
        }

        if(file.split('.').pop() != 'json'){
          log.w('In catalog with i18n files founded non json file', file);
          continue;
        }

        i18n[file.replace('.json', '')] = JSON.parse(readFileSync(join(path, file)));
      }
      catch(err){
        log.e('Error in i18n ' + path + '/' + file, err, err.stack);
      }
    }
  }

  return i18n;
}

function initServe(config, log){
  if(!config.serve || !config.serve.length){
    return null;
  }

  log.i('Server start serve dirs', config.serve);
  return config.serve;
}

function initModules(config, log){
  const inits = {};
  const modules = {};
  const info = [];

  for(const path of config.modules){
    const pathModules = readdirSync(path);
    for(let file of pathModules){
      try{
        let isDir = false;
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1) continue;

        if(lstatSync(path + '/' + file).isDirectory()){
          if(!existsSync(path + '/' + file + '/index.js')){
            if(!statSync(path + '/' + file + '/index.js').isFile()){
              continue;
            }
          }

          isDir = true;
        }

        if(!file.match(/^.*\.js$/) && !isDir) {
          continue;
        }

        const moduleName = file.replace('.js', '');
        let curModule = require(resolve(path) + '/' + file + (isDir ? '/index.js' : ''));//eslint-disable-line global-require
        if(curModule.__moduleInfo){
          curModule = curModule.__moduleInfo;
        }

        if(curModule.__init){
          inits[file] = curModule.__init;
        }

        if(curModule.__meta){
          let aliasURL = curModule.__meta.alias;
          if(aliasURL){
            aliasURL = getUrl(moduleName, aliasURL, curModule, {addToRoot: true});
          }
          if(curModule.__meta.default){
            modules[moduleName] = {
              func: curModule.__meta.default,
              meta: curModule.__meta
            };
            if(aliasURL){
              modules[aliasURL] = modules[moduleName];
            }
          }
          if(curModule.__meta.html){
            modules[moduleName] = {
              func: curModule.__meta.html,
              meta: curModule.__meta
            };
            if(aliasURL){
              modules[aliasURL] = modules[moduleName];
            }
          }
          if(curModule.__meta.find){
            modules[moduleName + '/*'] = {
              func: curModule.__meta.find,
              meta: curModule.__meta
            };
            if(aliasURL){
              modules[aliasURL + '/*'] = modules[moduleName];
            }
          }
        }

        const moduleApi = Object.assign({name: moduleName}, curModule.__meta, {methods: []});
        for(let m in curModule){
          if(m.indexOf('__') === 0) continue;

          if(m.indexOf('_') === 0){
            const methodMeta = curModule[m];

            let methodName = m.substring(1);
            if(!curModule[methodName]){
              log.e('module', moduleName, 'Method', methodName, 'in file', file, 'not found');
              continue;
            }

            const method = {
              func: curModule[methodName],
              meta: Object.assign({}, curModule.__meta || {}, methodMeta),
              definedIn: file
            };
            const methodInfo = Object.assign({}, method.meta);

            methodName = getUrlUtils(moduleName, methodName, curModule, methodInfo);

            if(modules[methodName]){
              log.e('curModule', moduleName, 'Method', methodName, 'in file', file, 'IS DEFINED IN', modules[methodName].definedIn);
              continue;
            }

            modules[methodName] = method;
            methodInfo.url = methodName;
            moduleApi.methods.push(methodInfo);

            let aliasURL = methodMeta.alias;
            if(aliasURL){
              aliasURL = getUrlUtils(moduleName, aliasURL, curModule, methodInfo);
              if(modules[aliasURL]){
                log.e('curModule', moduleName, 'Method', aliasURL, 'in file', file, 'IS DEFINED IN', modules[aliasURL].definedIn);
                continue;
              }

              modules[aliasURL] = method;
              methodInfo.alias = aliasURL;
            }
          }
        }

        if(moduleApi.methods.length){
          info.push(moduleApi);
        }

        curModule = null;
      }
      catch(err){
        log.e('Error in module ' + join(path + '/' + file), err, err.stack);
      }
    }
  }

  log.d('server methods accessible from the outside');
  Object.keys(modules).forEach(m=>{
    log.d(`\t\t\t${m}`);
  });

  return {
    inits,
    modules, 
    info
  };
}

function initMiddlewares(config, log){
  const inits = {};
  const middlewares = [];

  for(const path of config.middleware){
    const pathMiddleware = readdirSync(path);

    for(const file of pathMiddleware){
      try{
        if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
          continue;
        }

        if(lstatSync(path + '/' + file).isDirectory()){
          continue;
        }

        const middleware = require(resolve(path) + '/' + file);//eslint-disable-line global-require

        if(middleware.__init){
          inits[file] = middleware.__init;
        }

        const middlewareObject = {
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
      }
      catch(err){
        log.e('Error in middleware ' + path + '/' + file, err, err.stack);
      }
    }
  }

  if(config.middlewareOrder){
    for(let i in config.middlewareOrder){
      if(!Object.prototype.hasOwnProperty.call(config.middlewareOrder, i)){
        continue;
      }

      let ind = -1;
      for(let j in middlewares){
        if(middlewares[j].name == config.middlewareOrder[i]){
          ind = j;
          break;
        }
      }

      if(ind < 0){
        log.e('middleware specified in config.middlewareOrder has not been initialized', middlewares, config.middlewareOrder[i]);
        continue;
      }

      middlewares.splice(i, 0, middlewares.splice(ind, 1).pop());
    }
  }

  return {
    inits,
    middlewares
  };
}