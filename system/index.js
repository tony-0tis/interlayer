let fs = require('fs');
let path = require('path');
let helper = require('./_extra/index.js');

module.exports = function(config = {}){
  let initPath = path.dirname(new Error().stack.split('\n').splice(2, 1)[0].match(/at[^(]*\(([^)]+)\)/)[1]);

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
        throw 'config.path must be directory';
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
  let initPath = path.dirname(new Error().stack.split('\n').splice(2, 1)[0].match(/at[^(]*\(([^)]+)\)/)[1]);
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
    start(conf){
      if(conf){
        Object.assign(config, conf);
      }
      module.exports(config);
    },

    loadConfigFile(path){
      try{
        let conf = JSON.parse(fs.readFileSync(path));
        Object.assign(config, conf);
      }catch(e){console.log(e);}
      return settingsObject;
    },
    setConfig(conf){
      Object.assign(config, conf);
      return settingsObject;
    },
    setRootPath(path){
      config.path = path || initPath;
      return settingsObject;
    },
    setLogPath(path){
      config.logPath = path || initPath;
      return settingsObject;
    },
    setPort(port){
      config.port = port || 8080;
      return settingsObject;
    },
    setSecure(secure){
      config.secure = secure || null;
      return settingsObject;
    },
    setWorkersCount(workers){
      config.workers = workers || 1;
      return settingsObject;
    },
    setTimeout(timeout){
      config.timeout = timeout || 60;
      return settingsObject;
    },
    setDefaultHeaders(headers){
      config.defaultHeaders = headers || {};
      return settingsObject;
    },
    setRestartOnChange(bool){
      config.restartOnChange = bool || false
      return settingsObject;
    },
    setSkipDbWarning(bool){
      config.skipDbWarning = bool || false
      return settingsObject;
    },
    setDebugMode(bool){
      config.debug = bool || false
      return settingsObject;
    },
    setDisableNagleAlgoritm(bool){
      log.w('deprecated in v 0.9.0, use setNoDelay instead');
      return settingsObject;
    },
    setNoDelay(bool){
      config.noDelay = bool || true;
    },
    setInstantShutdownDelay(time){
      config.instantShutdownDelay = time || 1500;
      return settingsObject;
    },
    setRetryAter(){
      config.retryAter = time || 10;
      return settingsObject;
    },
    setWebsocketConfig(websocket){
      config.websocket = websocket || null;
      return settingsObject;
    },
    setUseFilesAsHTTPErrors(use){
      config.useHttpErrorFiles = use || true;
      return settingsObject;
    },

    addDal(dalName, dalConfig){
      config.useDals[dalName] = (dalConfig || {});
      return settingsObject;
    },
    addEmailSender(emailName, emailConfig){
      config.useEmailSenders[emailName] = (emailConfig || {});
      return settingsObject;
    },

    addDalPath(...paths){
      config.dals = config.dals.concat(paths);
      return settingsObject;
    },
    addMiddlewarePath(...paths){
      config.middleware = config.middleware.concat(paths);
      return settingsObject;
    },
    setMiddlewareOrder(...order){
      if(order.length == 1 && Array.isArray(order[0])){
        order = order[0];
      }
      config.middlewareOrder = config.middlewareOrder.concat(order);
      return settingsObject;
    },
    setMiddlewareTimeout(timeout){
      config.middlewareTimeout = timeout || 10;
      return settingsObject;
    },
    addModulesPath(...paths){
      config.modules = config.modules.concat(paths);
      return settingsObject;
    },
    addI18nPath(...paths){
      config.i18n = config.i18n.concat(paths);
      return settingsObject;
    },
    addServePath(...paths){
      config.serve = config.serve.concat(paths);
      return settingsObject;
    },
    addViewPath(...paths){
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
      if(logs[name]) return logs[name];

      logs[name] = global.logger.create('CHECKS');
      return logs[name];
    },
    setMeta(meta){
      moduleInfo.__meta = meta;
      return Module;
    },
    setInit(init){
      moduleInfo.__init = init;
      return Module;
    },
    addMethod(name, info, methodFunc){
      if(!methodFunc) {
        methodFunc = info;
        info = {};
      }
      moduleInfo['_'+ name] = info || {};
      moduleInfo[name] = methodFunc;
      return Module;
    },
    add(...args){this.addMethod(...args)},
    setMethodInfo(name, info){
      moduleInfo['_'+ name] = info || {};
      return Module;
    },
    info(...args){this.setMethodInfo(...args)},
    getMethod(name){
      return moduleInfo[name];
    },
    getMethodInfo(nam, withGlobal){
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