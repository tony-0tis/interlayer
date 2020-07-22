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
      console.log('config.useDals not defined, no one database will be included(to skip this log pass the skipDbWarning)');
    }
  }

  // Middleware
  helper.checkPath(initPath, config, 'middleware');

  // Email
  helper.checkPath(initPath, config, 'emailSenders');

  // Serve
  helper.checkPath(initPath, config, 'serve');

  if(config.disableNagleAlgoritm) console.warn('deprecated in v 0.9.0, use setNoDelay instead')
  
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
      if(typeof conf != 'object') return new Error('setConfig - first param must be an object');
      Object.assign(config, conf);
      return settingsObject;
    },
    setRootPath(path){
      if(typeof path != 'string') return new Error('setRootPath - first param must be a string');
      config.path = path;
      return settingsObject;
    },
    setLogPath(path){
      if(typeof path != 'string') return new Error('setLogPath - first param must be a string');
      config.logPath = path;
      return settingsObject;
    },
    setPort(port){
      if(typeof port != 'number') return new Error('setPort - first param must be a number');
      config.port = port;
      return settingsObject;
    },
    setWorkersCount(workers){
      if(typeof workers != 'number') return new Error('setWorkersCount - first param must be a number');
      if(workers < 1) return new Error('setWorkersCount - first param must to be above zero');
      config.workers = workers;
      return settingsObject;
    },
    setSecure(secure){
      if(typeof secure != 'object') return new Error('setSecure - first param must be an object');
      if(typeof secure.key != 'string') return new Error('setSecure - first param.key must be a string');
      if(typeof secure.cert != 'string') return new Error('setSecure - first param.cert must be a string');
      config.secure = secure;
      return settingsObject;
    },
    setWebsocketConfig(websocket){
      if(typeof websocket != 'object' && typeof websocket != 'boolean') return new Error('setWebsocketConfig - first param must be an object or boolean');
      config.websocket = websocket;
      return settingsObject;
    },
    setDefaultHeaders(headers){
      if(typeof headers != 'object') return new Error('setDefaultHeaders - first param must be an object');
      config.defaultHeaders = headers;
      return settingsObject;
    },
    setTimeout(timeout){
      if(typeof timeout != 'number') return new Error('setTimeout - first param must be a number');
      if(timeout < 1) return new Error('setTimeout - first param must to be above zero');
      config.timeout = timeout;
      return settingsObject;
    },
    setInstantShutdownDelay(delay){
      if(typeof delay != 'number') return new Error('setInstantShutdownDelay - first param must be a number');
      if(delay < 1) return new Error('setInstantShutdownDelay - first param must to be above zero');
      config.instantShutdownDelay = delay;
      return settingsObject;
    },
    setRetryAter(time){
      if(typeof time != 'number') return new Error('setRetryAter - first param must be a number');
      if(time < 1) return new Error('setRetryAter - first param must to be above zero');
      config.retryAter = time;
      return settingsObject;
    },
    setRestartOnChange(bool){
      if(typeof bool != 'boolean') return new Error('setRestartOnChange - first param must be a boolean');
      config.restartOnChange = bool;
      return settingsObject;
    },
    setSkipDbWarning(bool){
      if(typeof bool != 'boolean') return new Error('setSkipDbWarning - first param must be a boolean');
      config.skipDbWarning = bool;
      return settingsObject;
    },
    setDebugMode(bool){
      if(typeof bool != 'boolean') return new Error('setDebugMode - first param must be a boolean');
      config.debug = bool;
      return settingsObject;
    },
    setNoDelay(bool){
      if(typeof bool != 'boolean') return new Error('setNoDelay - first param must be a boolean');
      config.noDelay = bool;
      return settingsObject;
    },
    setUseFilesAsHTTPErrors(bool){
      if(typeof bool != 'boolean') return new Error('setUseFilesAsHTTPErrors - first param must be a boolean');
      config.useHttpErrorFiles = bool;
      return settingsObject;
    },
    setDisableNagleAlgoritm(){
      console.warn('setDisableNagleAlgoritm - deprecated in v 0.9.0, use setNoDelay instead');
      return settingsObject;
    },

    addDal(dalName, dalConfig={}){
      if(typeof dalName != 'string') return new Error('addDal - first param must be a string');
      if(typeof dalConfig != 'object') return new Error('addDal - second param must be an object');
      config.useDals[dalName] = dalConfig;
      return settingsObject;
    },
    addEmailSender(emailName, emailConfig={}){
      if(typeof emailName != 'string') return new Error('addEmailSender - first param must be a string');
      if(typeof emailConfig != 'object') return new Error('addEmailSender - second param must be an object');
      config.useEmailSenders[emailName] = emailConfig;
      return settingsObject;
    },

    addDalPath(...paths){
      if(!paths.length) return new Error('addDalPath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addDalPath - first and other params must be a string');
      config.dals = config.dals.concat(paths);
      return settingsObject;
    },
    addMiddlewarePath(...paths){
      if(!paths.length) return new Error('addMiddlewarePath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addMiddlewarePath - first and other params must be a string');
      config.middleware = config.middleware.concat(paths);
      return settingsObject;
    },
    setMiddlewareOrder(...orders){
      if(orders.length == 1 && Array.isArray(orders[0])){
        orders = orders[0];
      }
      if(!orders.length || orders.filter(p=>typeof p != 'string').length) return new Error('setMiddlewareOrder - first param must be an array of strings or first and other params must be a string');
      config.middlewareOrder = config.middlewareOrder.concat(orders);
      return settingsObject;
    },
    setMiddlewareTimeout(timeout){
      if(typeof timeout != 'number') return new Error('setMiddlewareTimeout - first param must be a number');
      config.middlewareTimeout = timeout;
      return settingsObject;
    },
    addModulesPath(...paths){
      if(!paths.length) return new Error('addModulesPath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addModulesPath - first and other params must be a string');
      config.modules = config.modules.concat(paths);
      return settingsObject;
    },
    addI18nPath(...paths){
      if(!paths.length) return new Error('addI18nPath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addI18nPath - first and other params must be a string');
      config.i18n = config.i18n.concat(paths);
      return settingsObject;
    },
    addServePath(...paths){
      if(!paths.length) return new Error('addServePath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addServePath - first and other params must be a string');
      config.serve = config.serve.concat(paths);
      return settingsObject;
    },
    addViewPath(...paths){
      if(!paths.length) return new Error('addViewPath - first and other params must be a string');
      if(paths.filter(p=>typeof p != 'string').length) return new Error('addViewPath - first and other params must be a string');
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

  let addMethod = (name, info, methodFunc, method)=>{
    if(!methodFunc) {
      methodFunc = info;
      info = {};
    }

    if(typeof name != 'string') return new Error(method + ' - first param must be a string');
    if(typeof info != 'object') return new Error(method + ' - second param must be an object');
    if(typeof methodFunc != 'function') return new Error(method + ' - third param must be a function');
    
    moduleInfo['_'+ name] = info || {};
    moduleInfo[name] = methodFunc;
    return Module;
  };
  let setMethodInfo = (name, info={}, method)=>{
    if(typeof name != 'string') return new Error(method + ' - first param must be a string');
    if(typeof info != 'object') return new Error(method + ' - second param must be an object');

    moduleInfo['_'+ name] = info;
    return Module;
  };

  let Module = {
    __moduleInfo: moduleInfo,
    getLog(name){
      if(typeof name != 'string') return new Error('getLog - first param must be a string');

      if(logs[name]) return logs[name];

      logs[name] = global.logger.create(name);
      return logs[name];
    },
    setMeta(meta){
      if(typeof meta != 'object') return new Error('setMeta - first param must be an object');
      moduleInfo.__meta = meta;
      return Module;
    },
    setInit(init){
      if(typeof init != 'function') return new Error('setInit - first param must be a function');
      moduleInfo.__init = init;
      return Module;
    },
    addMethod(name, info, methodFunc){
      return addMethod(name, info, methodFunc, 'addMethod');
    },
    add(name, info, methodFunc){
      return addMethod(name, info, methodFunc, 'add');
    },
    setMethodInfo(name, info={}){
      return setMethodInfo(name, info, 'setMethodInfo');
    },
    info(name, info){
      return setMethodInfo(name, info, 'info');
    },
    getMethod(name){
      if(typeof name != 'string') return new Error('getMethod - first param must be a string');
      return moduleInfo[name];
    },
    getMethodInfo(name, withGlobal){
      if(typeof name != 'string') return new Error('getMethodInfo - first param must be a string');
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
      helper.server.addPPLog('server obtain ping');
      if(process.send){
        process.send({
          type: 'pong',
          id: obj.id
        });
        helper.server.addPPLog('server send pong');
        helper.startPing();
      }
      break;
    case 'pong':
      let ind = helper.serverStat.pings.indexOf(obj.id);
      if(ind > -1){
        helper.serverStat.pings.splice(ind, 1);
      }
      helper.server.addPPLog('server obtain pong');
      break;
    case 'reload':
      helper.server.addLog('reload command');
      helper.graceful_shutdown(0);
      break;
    case 'exit':
      helper.server.addLog('exit command');
      helper.graceful_shutdown(1);
      break;
  }

  if(obj == 'shutdown') {
    helper.server.addLog('process message shutdown');
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