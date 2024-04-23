debugger;
const { readFileSync, statSync } = require('fs');
const { join, isAbsolute } = require('path');

const { getRootPathUtils, checkPathUtils, initLoggerUtils } = require('./system/utils.js');
const { initCluster, stopCluster } = require('./system/cluster.js');
const { initServer, serverLog, graceful_shutdown, isGracefulShutdownInited } = require('./system/server.js');

module.exports = function(config = {}){
  let initPath = getRootPathUtils(new Error());

  if(typeof config == 'string'){
    try{
      if(!isAbsolute(config)){
        config = join(initPath, config);
      }

      config = JSON.parse(readFileSync(config));
    }catch(e){
      config = {};
      throw 'wrong config file' + e;
    }
  }
  
  if(config.path){
    if(!isAbsolute(config.path)){
      throw 'config.path must be absolute path';
    }

    try{
      if(!statSync(config.path).isDirectory()){
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
  else if(!isAbsolute(config.logPath)){
    config.logPath = join(initPath, config.logPath);
  }

  // Modules
  checkPathUtils(initPath, config, 'modules', 'modules');
  
  // Views
  checkPathUtils(initPath, config, 'views', 'files');

  // I18n
  checkPathUtils(initPath, config, 'i18n', 'i18n');

  // Dals
  checkPathUtils(initPath, config, 'dals');
  if(!config.useDals || !Object.keys(config.useDals).length){
    if(!config.skipDbWarning){
      console.log('config.useDals not defined, no one database will be included(to skip this log pass the skipDbWarning)');
    }
  }

  // Middleware
  checkPathUtils(initPath, config, 'middleware');

  // Email
  checkPathUtils(initPath, config, 'emailSenders');

  // Serve
  checkPathUtils(initPath, config, 'serve');

  if(config.disableNagleAlgoritm) {
    console.warn('deprecated in v 0.9.0, use setNoDelay instead');
  }
  
  process.chdir(initPath);

  setTimeout(()=>{
    global.intervals.start();
    initLoggerUtils(config);

    if(!config.workers || config.workers === 1){
      initServer(config);
    }
    else{
      initCluster(config);
    }
  }, 20);
};

module.exports.server = () => {
  const initPath = getRootPathUtils(new Error());
  const config = {
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
    websocket: null,
    startInits: true,
    formidableOptions: {}
  };
  const settingsObject = {
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
        Object.assign(config, JSON.parse(readFileSync(path).toString()));
      }catch(e){
        console.log(e);
      }
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
    setSkipParsePost(bool){
      if(typeof bool != 'boolean') return new Error('setSkipParsePost - first param must be a boolean');
      config.skipParsePost = bool;
      return settingsObject;
    },
    setFormidableOptions(options){
      if(typeof conf != 'object') return new Error('setConfig - first param must be an object');
      Object.assign(config.formidableOptions, options);
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
    },
    setStartInits(bool){
      if(typeof bool != 'boolean') return new Error('setStartInits - first param must be a boolean');
      config.startInits = bool;
      return settingsObject;
    },
    disableLogFile(bool){
      if(typeof bool != 'boolean') return new Error('setStartInits - first param must be a boolean');
      config.disableLogFile = bool;
      return settingsObject;
    }
  };
  return settingsObject;
};

module.exports.module = () => {
  const logs = {};
  const moduleInfo = {
    __meta: null,
    __init: null
  };

  const addMethod = (name, info, methodFunc, method)=>{
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
  const setMethodInfo = (name, info={}, method)=>{
    if(typeof name != 'string') return new Error(method + ' - first param must be a string');
    if(typeof info != 'object') return new Error(method + ' - second param must be an object');

    moduleInfo['_'+ name] = info;
    return Module;
  };

  const Module = {
    __moduleInfo: moduleInfo,
    getLog(name){
      if(typeof name != 'string') return new Error('getLog - first param must be a string');

      if(logs[name]) return logs[name];

      logs[name] = global.logger(name);
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
};


global.intervals = {
  _si: null,
  start(){
    this.stop();

    console.debug('start global intervals, pid', process.pid);
    this._si = setInterval(()=>this._check(), 1000);
  },
  stop(){
    if(this._si == null) return;

    console.debug('stop global intervals');
    clearInterval(this._si);
  },
  _check(){
    for(const func of this._funcs){
      if(func.disabled) continue;

      if(func.timeout != null){
        if(typeof func.timeout === 'number'){
          if(Date.now() < func.datetime + func.timeout * 1000){
            continue;
          }
        }
        else{
          const d = new Date();
          const [dYear, dMonth, dDate, dDay, dHour, dMinute, dSecond] = [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getMinutes(), d.getSeconds()];
          const {year, month, date, day, hour, minute, second} = func.timeout;

          if(year != null && year != '*' && !String(year).split(',').includes(String(dYear))) continue;
          if(month != null && month != '*' && !String(month).split(',').includes(String(dMonth))) continue;
          if(date != null && date != '*' && !String(date).split(',').includes(String(dDate))) continue;
          if(day != null && day != '*' && !String(day).split(',').includes(String(dDay))) continue;
          if(hour != null && hour != '*' && !String(hour).split(',').includes(String(dHour))) continue;
          if(minute != null && minute != '*' && !String(minute).split(',').includes(String(dMinute))) {
            delete func.minuteRun;
            continue;
          }
          if(second != null && second != '*' && !String(second).split(',').includes(String(dSecond))) continue;
          if(minute != null && (second == null || second === '*')){
            if(String(minute).split(',').includes(String(func.minuteRun))){
              continue;
            }
            func.minuteRun = dMinute;
          }
        }
      }

      func.func(this.del.bind(this, func.key));//send cb with delete current interval
      func.datetime = Date.now();
    }
  },
  _funcs: [],
  add(func, timeout){
    if(timeout == null){
      console.warn('function will be called every second', new Error());
    }

    const key = Math.random() * Date.now();
    this._funcs.push({
      key,
      func: func,
      timeout: timeout,
      datetime: Date.now(),
    });
    return key;
  },
  del(key){
    const ind = this._funcs.reduce((index,obj,ind)=>{
      if(obj.key == key){
        index = ind;
      }
      return index;
    }, -1);
    this._funcs.splice(ind, 1);
    return key;
  },
  enable(key){
    this.disable(key, false);
  },
  disable(key, val){
    this._funcs.forEach(obj=>{
      if(obj.key == key){
        if(val == false) {
          obj.disabled = false;
        }
        else {
          obj.disabled = true;
        }
      }
    });
  }
};

process.on('exit', function(){
  if(isGracefulShutdownInited()){
    if(global.intervals) {
      global.intervals.stop();
    }

    return process.exit();
  }

  serverLog('exit event', process.exitCode);
  stopCluster();
  graceful_shutdown();
});
process.on('SIGINT', ()=>{
  serverLog('SIGINT event', process.exitCode);
  stopCluster();
  graceful_shutdown(1);
});
process.on('SIGTERM', ()=>{
  serverLog('SIGTERM event', process.exitCode);
  stopCluster();
  graceful_shutdown();
});
process.on('SIGUSR1', ()=>{
  serverLog('SIGTERM event', process.exitCode);
  stopCluster();
  graceful_shutdown();
});
process.on('SIGUSR2', ()=>{
  serverLog('SIGTERM event', process.exitCode);
  stopCluster();
  graceful_shutdown();
});

process.on('message', obj=> {
  if(obj === 'shutdown') {
    serverLog('process message shutdown');
    stopCluster();
    graceful_shutdown(1);
  }
  if(obj.type === 'startServerInWorker'){
    global.intervals.start();
    initLoggerUtils(obj.config);
    initServer(obj.config);
  }
  if(obj.type === 'reloadWorker'){
    serverLog('reload command');
    graceful_shutdown(0);
  }
  if(obj.type === 'clusterStopped'){
    serverLog('exit command');
    graceful_shutdown(1);
  }
});

process.on('uncaughtException', err => {
  console.error(Date.now(), '!!! Caught exception !!!', err);
});