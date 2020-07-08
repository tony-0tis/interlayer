let fs = require('fs');
let path = require('path');
let helper = require('./_extra/index.js');

function getRootPath(error) {
  return path.dirname(error.stack.split('\n').splice(2, 1)[0].match(/at\s?[^(]*\(?([^)]+)\)?/)[1])
}

module.exports = function(config = {}){
  let initPath = getRootPath(new Error());

  if(typeof config == 'string'){
    try{
      if(!path.isAbsolute(config)){
        config = path.join(initPath, config);
      }

      config = JSON.parse(fs.readFileSync(config));
    }catch(e){
      config = {};
      throw 'wrong config file' + e;
    }
  }
  
  if(config.path){
    if(!path.isAbsolute(config.path)){
      throw 'config.path must be absolute path';
    }

    try{
      if(!fs.statSync(config.path).isDirectory()){
        throw 'config.path must be a directory';
      }

      initPath = config.path;
    }
    catch(e){
      throw config.path + 'is not created: ' + e;
    }
  }

  config.initPath = initPath;

  if(!config.logPath){
    config.logPath = initPath;
  }
  else if(!path.isAbsolute(config.logPath)){
    config.logPath = path.join(initPath, config.logPath);
  }

  // Modules
  helper.checkPath(initPath, config, 'modules', 'modules');
  
  // Views
  helper.checkPath(initPath, config, 'views', 'files');

  // I18n
  helper.checkPath(initPath, config, 'i18n', 'i18n');

  // Dals
  helper.checkPath(initPath, config, 'dals');
  if(!config.useDals || !Object.keys(config.useDals).length){
    if(!config.skipDbWarning){
      console.log('config.useDals not defined, no one database will be included');
    }
  }

  // Middleware
  helper.checkPath(initPath, config, 'middleware');

  // Email
  helper.checkPath(initPath, config, 'emailSenders');

  // Serve
  helper.checkPath(initPath, config, 'serve');

  if(config.disableNagleAlgoritm) log.w('deprecated in v 0.9.0, use setNoDelay instead')
  
  process.chdir(initPath);

  setTimeout(()=>{
    helper.cluster.start(config);
  }, 20);
};

module.exports.server = ()=>{
  let initPath = getRootPath(new Error());
  let config = {
    path: initPath,
    logPath: initPath,
    port: 8080,
    workers: 1,
    secure: null,
    timeout: 60,
    middlewareTimeout: 10,
    useDals: {},
    useEmailSenders: {},
    defaultHeaders: {},
    restartOnChange: false,
    skipDbWarning: false,
    debug: false,
    noDelay: true,
    useHttpErrorFiles: false,
    instantShutdownDelay: 1500,
    retryAter: 10,
    dals: [],
    middleware: [],
    middlewareOrder: [],
    modules: [],
    i18n: [],
    views: [],
    serve: [],
    websocket: null
  };
  let settingsObject = {
    __config: config,
    start(conf){
      if(conf){
        Object.assign(config, conf);
      }
      module.exports(config);
    },
    getConfig(){
      return config;
    },
    loadConfigFile(path){
      try{
        let conf = JSON.parse(fs.readFileSync(path));
        Object.assign(config, conf);
      }catch(e){console.log(e);}
      return settingsObject;
    },
    setConfig(conf){
      if(typeof conf != 'object') throw 'first param must be an object';
      Object.assign(config, conf);
      return settingsObject;
    },
    setRootPath(path){
      if(typeof path != 'string') throw 'first param must be a string';
      config.path = path;
      return settingsObject;
    },
    setLogPath(path){
      if(typeof path != 'string') throw 'first param must be a string';
      config.logPath = path;
      return settingsObject;
    },
    setPort(port){
      if(typeof port != 'number') throw 'first param must be a number';
      config.port = port;
      return settingsObject;
    },
    setWorkersCount(workers){
      if(typeof workers != 'number') throw 'first param must be a number';
      if(workers < 1) throw 'first param must to be above zero';
      config.workers = workers;
      return settingsObject;
    },
    setSecure(secure){
      if(typeof secure != 'object') throw 'first param must be an object';
      if(typeof secure.key != 'string') throw 'first param.key must be a string';
      if(typeof secure.cert != 'string') throw 'first param.cert must be a string';
      config.secure = secure;
      return settingsObject;
    },
    setWebsocketConfig(websocket){
      if(typeof websocket != 'object') throw 'first param must be an object';
      config.websocket = websocket;
      return settingsObject;
    },
    setDefaultHeaders(headers){
      if(typeof headers != 'object') throw 'first param must be an object';
      config.defaultHeaders = headers;
      return settingsObject;
    },
    setTimeout(timeout){
      if(typeof timeout != 'number') throw 'first param must be a number';
      if(timeout < 1) throw 'first param must to be above zero';
      config.timeout = timeout;
      return settingsObject;
    },
    setInstantShutdownDelay(delay){
      if(typeof delay != 'number') throw 'first param must be a number';
      if(delay < 1) throw 'first param must to be above zero';
      config.instantShutdownDelay = delay;
      return settingsObject;
    },
    setRetryAter(time){
      if(typeof time != 'number') throw 'first param must be a number';
      if(time < 1) throw 'first param must to be above zero';
      config.retryAter = time;
      return settingsObject;
    },
    setRestartOnChange(bool){
      if(typeof bool != 'boolean') throw 'first param must be a boolean';
      config.restartOnChange = bool;
      return settingsObject;
    },
    setSkipDbWarning(bool){
      if(typeof bool != 'boolean') throw 'first param must be a boolean';
      config.skipDbWarning = bool;
      return settingsObject;
    },
    setDebugMode(bool){
      if(typeof bool != 'boolean') throw 'first param must be a boolean';
      config.debug = bool;
      return settingsObject;
    },
    setNoDelay(bool){
      if(typeof bool != 'boolean') throw 'first param must be a boolean';
      config.noDelay = bool;
      return settingsObject;
    },
    setUseFilesAsHTTPErrors(bool){
      if(typeof bool != 'boolean') throw 'first param must be a boolean';
      config.useHttpErrorFiles = bool;
      return settingsObject;
    },
    setDisableNagleAlgoritm(){
      console.warn('deprecated in v 0.9.0, use setNoDelay instead');
      return settingsObject;
    },

    addDal(dalName, dalConfig={}){
      if(typeof dalName != 'string') throw 'first param must be a string';
      if(typeof dalConfig != 'object') throw 'second param must be an object';
      config.useDals[dalName] = dalConfig;
      return settingsObject;
    },
    addEmailSender(emailName, emailConfig={}){
      if(typeof emailName != 'string') throw 'first param must be a string';
      if(typeof emailConfig != 'object') throw 'second param must be an object';
      config.useEmailSenders[emailName] = emailConfig;
      return settingsObject;
    },

    addDalPath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.dals = config.dals.concat(paths);
      return settingsObject;
    },
    addMiddlewarePath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.middleware = config.middleware.concat(paths);
      return settingsObject;
    },
    setMiddlewareOrder(...orders){
      if(orders.length == 1 && Array.isArray(orders[0])){
        orders = orders[0];
      }
      if(!orders.length || orders.filter(p=>typeof p != 'string').length) throw 'first param must be an array of strings or first and other params must be a string';
      config.middlewareOrder = config.middlewareOrder.concat(orders);
      return settingsObject;
    },
    setMiddlewareTimeout(timeout){
      if(typeof timeout != 'number') throw 'first param must be a number';
      config.middlewareTimeout = timeout;
      return settingsObject;
    },
    addModulesPath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.modules = config.modules.concat(paths);
      return settingsObject;
    },
    addI18nPath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.i18n = config.i18n.concat(paths);
      return settingsObject;
    },
    addServePath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.serve = config.serve.concat(paths);
      return settingsObject;
    },
    addViewPath(...paths){
      if(!paths.length) throw 'first and other params must be a string';
      if(paths.filter(p=>typeof p != 'string').length) throw 'first and other params must be a string';
      config.views = config.views.concat(paths);
      return settingsObject;
    }
  };
  return settingsObject;
};

module.exports.module = ()=>{
  let logs = {};
  let moduleInfo = {
    __meta: null,
    __init: null
  };
  let Module = {
    __moduleInfo: moduleInfo,
    getLog(name){
      if(typeof name != 'string') throw 'first param must be a string'

      if(logs[name]) return logs[name];

      logs[name] = global.logger.create(name);
      return logs[name];
    },
    setMeta(meta){
      if(typeof meta != 'object') throw 'first param must be an object';
      moduleInfo.__meta = meta;
      return Module;
    },
    setInit(init){
      if(typeof init != 'object') throw 'first param must be an object';
      moduleInfo.__init = init;
      return Module;
    },
    addMethod(name, info, methodFunc){
      if(!methodFunc) {
        methodFunc = info;
        info = {};
      }

      if(typeof methodFunc != 'function') throw 'third param must be a function'
      if(typeof info != 'object') throw 'second param must be an object';
      
      moduleInfo['_'+ name] = info || {};
      moduleInfo[name] = methodFunc;
      return Module;
    },
    add(...args){return this.addMethod(...args)},
    setMethodInfo(name, info={}){
      if(typeof info != 'object') throw 'second param must be an object';
      moduleInfo['_'+ name] = info;
      return Module;
    },
    info(...args){return this.setMethodInfo(...args)},
    getMethod(name){
      return moduleInfo[name];
    },
    getMethodInfo(name, withGlobal){
      if(!withGlobal){
        return moduleInfo['_'+ name];
      }
      else{
        return Object.assign({}, moduleInfo.__meta, moduleInfo['_'+ name]);
      }
    }
  };
  return Module;
}

process.on('message', obj=> {
  switch(obj.type){
    case 'start': 
      helper.server.start(obj.config);
      break;
    case 'ping':
      log.pp('server obtain ping');
      if(process.send){
        process.send({
          type: 'pong',
          id: obj.id
        });
        log.pp('server send pong');
        helper.startPing();
      }
      break;
    case 'pong':
      let ind = helper.serverStat.pings.indexOf(obj.id);
      if(ind > -1){
        helper.serverStat.pings.splice(ind, 1);
      }
      log.pp('server obtain pong');
      break;
    case 'reload':
      log.i('reload command');
      helper.graceful_shutdown(0);
      break;
    case 'exit':
      log.i('exit command');
      helper.graceful_shutdown(1);
      break;
  }

  if(obj == 'shutdown') {
    log.i('process message shutdown');
    helper.graceful_shutdown(1);
  }
});

process.on('exit', function(){
  if(helper.gracefulShutdownInited){
    if(global.intervals) global.intervals.stop();
    return process.exit();
  }

  helper.server.addLog('exit event', process.exitCode, exports.serverStat);
  helper.graceful_shutdown();
});
process.on('SIGINT', ()=>{
  helper.server.addLog('SIGINT event', process.exitCode);
  helper.graceful_shutdown(1);
});
process.on('SIGTERM', ()=>{
  helper.server.addLog('SIGTERM event', process.exitCode);
  helper.graceful_shutdown(1);
});