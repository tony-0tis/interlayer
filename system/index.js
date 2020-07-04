let fs = require('fs');
let path = require('path');
let helper = require('./_extra/index.js');

module.exports = function(config = {}){
  let paths = {};
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

  paths.initPath = initPath;

  if(!config.logPath){
    config.logPath = initPath;
  }
  else if(!path.isAbsolute(config.logPath)){
    config.logPath = path.join(initPath, config.logPath);
  }

  // Modules
  helper.checkPath(paths, initPath, config, 'modules', 'modules');
  
  // Views
  helper.checkPath(paths, initPath, config, 'views', 'files');

  // I18n
  helper.checkPath(paths, initPath, config, 'i18n', 'i18n');

  // Dals
  helper.checkPath(paths, initPath, config, 'dals');
  if(!config.useDals || !Object.keys(config.useDals).length){
    if(!config.skipDbWarning){
      console.log('config.useDals not defined, no one database will be included');
    }
  }

  // Middleware
  helper.checkPath(paths, initPath, config, 'middleware');

  // Email
  helper.checkPath(paths, initPath, config, 'emailSenders');

  // Serve
  helper.checkPath(paths, initPath, config, 'serve');
  
  process.chdir(initPath);

  setTimeout(()=>{
    helper.cluster.start(paths, config);
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
    disableNagleAlgoritm: false,
    instantShutdownDelay: 1500,
    retryAter: 10,
    dals: [],
    middleware: [],
    middlewareOrder: [],
    modules: [],
    i18n: [],
    views: [],
    serve: [],
  };
  let settings = {
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
      return settings;
    },
    setConfig(conf){
      Object.assign(config, conf);
      return settings;
    },
    setRootPath(path){
      config.path = path || initPath;
      return settings;
    },
    setLogPath(path){
      config.logPath = path || initPath;
      return settings;
    },
    setPort(port){
      config.port = port || 8080;
      return settings;
    },
    setSecure(secure){
      config.secure = secure || null;
      return settings;
    },
    setWorkersCount(workers){
      config.workers = workers || 1;
      return settings;
    },
    setTimeout(timeout){
      config.timeout = timeout || 60;
      return settings;
    },
    setDefaultHeaders(headers){
      config.defaultHeaders = headers || {};
      return settings;
    },
    setRestartOnChange(bool){
      config.restartOnChange = bool || false
      return settings;
    },
    setSkipDbWarning(bool){
      config.skipDbWarning = bool || false
      return settings;
    },
    setDebugMode(bool){
      config.debug = bool || false
      return settings;
    },
    setDisableNagleAlgoritm(bool){
      config.disableNagleAlgoritm = bool || false
      return settings;
    },
    setInstantShutdownDelay(time){
      config.instantShutdownDelay = time || 1500;
      return settings;
    },
    setRetryAter(){
      config.retryAter = time || 10;
      return settings;
    },

    addDal(dalName, dalConfig){
      config.useDals[dalName] = (dalConfig || {});
      return settings;
    },

    addEmailSender(emailName, emailConfig){
      config.useEmailSenders[emailName] = (emailConfig || {});
      return settings;
    },

    addDalPath(...paths){
      config.dals = config.dals.concat(paths);
      return settings;
    },
    addMiddlewarePath(...paths){
      config.middleware = config.middleware.concat(paths);
      return settings;
    },
    setMiddlewareOrder(...order){
      if(order.length == 1 && Array.isArray(order[0])){
        order = order[0];
      }
      config.middlewareOrder = config.middlewareOrder.concat(order);
      return settings;
    },
    setMiddlewareTimeout(timeout){
      config.middlewareTimeout = timeout || 10;
      return settings;
    },
    addModulesPath(...paths){
      config.modules = config.modules.concat(paths);
      return settings;
    },
    addI18nPath(...paths){
      config.i18n = config.i18n.concat(paths);
      return settings;
    },
    addServePath(...paths){
      config.serve = config.serve.concat(paths);
      return settings;
    },
    addViewPath(...paths){
      config.views = config.views.concat(paths);
      return settings;
    }
  };
  return settings;
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