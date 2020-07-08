require(process.cwd() + '/test/init');
let index = rewire(process.cwd() + '/system/index');

index.__set__('helper', {
  graceful_shutdown(){

  },
  server:{
    addLog(){

    }
  },
  checkPath(){

  },
  cluster:{
    start(){

    }
  }
});
let helper = index.__get__('helper');

describe('init', () => {
	//before(()=>{})
	//after(()=>{})
	//beforeEach(()=>{})
	//afterEach(()=>{})
  describe.skip('exports', ()=>{
    it('', ()=>{

    })
  })
  describe.only('init server', ()=>{
    let srv;
    let defaultConfig;
    
    it('server and config init', ()=>{
      chai.assert.isNotNull(index.server);
    })
    beforeEach(()=>{
      chai.assert.doesNotThrow(()=>srv = index.server());
      defaultConfig = JSON.parse(JSON.stringify(srv.__config));
    })
    it('getConfig', ()=>{
      chai.assert.deepEqual(srv.getConfig(), defaultConfig);
    })
    it('setConfig', ()=>{
      chai.assert.throws(()=>srv.setConfig(), 'first param must be an object');
      chai.assert.deepEqual(srv.setConfig({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {test: true}));
    })
    it('setRootPath', ()=>{
      chai.assert.throws(()=>srv.setRootPath(), 'first param must be a string');
      chai.assert.deepEqual(srv.setRootPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {path: 'path1'}));
    })
    it('setLogPath', ()=>{
      chai.assert.throws(()=>srv.setLogPath(), 'first param must be a string');
      chai.assert.deepEqual(srv.setLogPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {logPath: 'path1'}));
    })
    it('setPort', ()=>{
      chai.assert.throws(()=>srv.setPort(), 'first param must be a number');
      chai.assert.deepEqual(srv.setPort(8000), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {port: 8000}));
    })
    it('setWorkersCount', ()=>{
      chai.assert.throws(()=>srv.setWorkersCount(), 'first param must be a number');
      chai.assert.throws(()=>srv.setWorkersCount(0), 'first param must to be above zero');
      chai.assert.deepEqual(srv.setWorkersCount(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {workers: 1}));
    })
    it('setSecure', ()=>{
      chai.assert.throws(()=>srv.setSecure(), 'first param must be an object');
      chai.assert.throws(()=>srv.setSecure({key: 1}), 'first param.key must be a string');
      chai.assert.throws(()=>srv.setSecure({key: 'path1', cert: 1}), 'first param.cert must be a string');
      chai.assert.deepEqual(srv.setSecure({key: '1', cert: '1'}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {secure: {key: '1', cert: '1'}}));
    })
    it('setWebsocketConfig', ()=>{
      chai.assert.throws(()=>srv.setWebsocketConfig(), 'first param must be an object');
      chai.assert.deepEqual(srv.setWebsocketConfig({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {websocket: {test: true}}));
    })
    it('setDefaultHeaders', ()=>{
      chai.assert.throws(()=>srv.setDefaultHeaders(), 'first param must be an object');
      chai.assert.deepEqual(srv.setDefaultHeaders({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {defaultHeaders: {test: true}}));
    })
    it('setTimeout', ()=>{
      chai.assert.throws(()=>srv.setTimeout(), 'first param must be a number');
      chai.assert.throws(()=>srv.setTimeout(0), 'first param must to be above zero');
      chai.assert.deepEqual(srv.setTimeout(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {timeout: 1}));
    })
    it('setInstantShutdownDelay', ()=>{
      chai.assert.throws(()=>srv.setInstantShutdownDelay(), 'first param must be a number');
      chai.assert.throws(()=>srv.setInstantShutdownDelay(0), 'first param must to be above zero');
      chai.assert.deepEqual(srv.setInstantShutdownDelay(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {instantShutdownDelay: 1}));
    })
    it('setRetryAter', ()=>{
      chai.assert.throws(()=>srv.setRetryAter(), 'first param must be a number');
      chai.assert.throws(()=>srv.setRetryAter(0), 'first param must to be above zero');
      chai.assert.deepEqual(srv.setRetryAter(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {retryAter: 1}));
    })
    it('setRestartOnChange', ()=>{
      chai.assert.throws(()=>srv.setRestartOnChange(), 'first param must be a boolean');
      chai.assert.deepEqual(srv.setRestartOnChange(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {restartOnChange: true}));
    })
    it('setSkipDbWarning', ()=>{
      chai.assert.throws(()=>srv.setSkipDbWarning(), 'first param must be a boolean');
      chai.assert.deepEqual(srv.setSkipDbWarning(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {skipDbWarning: true}));
    })
    it('setDebugMode', ()=>{
      chai.assert.throws(()=>srv.setDebugMode(), 'first param must be a boolean');
      chai.assert.deepEqual(srv.setDebugMode(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {debug: true}));
    })
    it('setNoDelay', ()=>{
      chai.assert.throws(()=>srv.setNoDelay(), 'first param must be a boolean');
      chai.assert.deepEqual(srv.setNoDelay(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {noDelay: true}));
    })
    it('setUseFilesAsHTTPErrors', ()=>{
      chai.assert.throws(()=>srv.setUseFilesAsHTTPErrors(), 'first param must be a boolean');
      chai.assert.deepEqual(srv.setUseFilesAsHTTPErrors(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useHttpErrorFiles: true}));
    })
    it('setDisableNagleAlgoritm', ()=>{
      chai.assert.deepEqual(srv.setDisableNagleAlgoritm(true), srv);
      chai.assert.deepEqual(srv.__config, defaultConfig);
    })
    it('addDal', ()=>{
      chai.assert.throws(()=>srv.addDal(), 'first param must be a string');
      chai.assert.throws(()=>srv.addDal('dal', 1), 'second param must be an object');
      chai.assert.deepEqual(srv.addDal('dal', {test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useDals: {dal: {test: true}}}));
    })
    it('addEmailSender', ()=>{
      chai.assert.throws(()=>srv.addEmailSender(), 'first param must be a string');
      chai.assert.throws(()=>srv.addEmailSender('email', 1), 'second param must be an object');
      chai.assert.deepEqual(srv.addEmailSender('email', {test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useEmailSenders: {email: {test: true}}}));
    })
    it('addDalPath', ()=>{
      chai.assert.throws(()=>srv.addDalPath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addDalPath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addDalPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {dals: ['path1']}));
    })
    it('addMiddlewarePath', ()=>{
      chai.assert.throws(()=>srv.addMiddlewarePath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addMiddlewarePath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addMiddlewarePath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middleware: ['path1']}));
    })
    it('setMiddlewareOrder', ()=>{
      chai.assert.throws(()=>srv.setMiddlewareOrder(), 'first param must be an array of strings or first and other params must be a string');
      chai.assert.throws(()=>srv.setMiddlewareOrder(1), 'first param must be an array of strings or first and other params must be a string');
      chai.assert.deepEqual(srv.setMiddlewareOrder('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middlewareOrder: ['path1']}));
    })
    it('setMiddlewareTimeout', ()=>{
      chai.assert.throws(()=>srv.setMiddlewareTimeout(), 'first param must be a number');
      chai.assert.deepEqual(srv.setMiddlewareTimeout(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middlewareTimeout: 1}));
    })
    it('addModulesPath', ()=>{
      chai.assert.throws(()=>srv.addModulesPath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addModulesPath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addModulesPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {modules: ['path1']}));
    })
    it('addI18nPath', ()=>{
      chai.assert.throws(()=>srv.addI18nPath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addI18nPath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addI18nPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {i18n: ['path1']}));
    })
    it('addServePath', ()=>{
      chai.assert.throws(()=>srv.addServePath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addServePath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addServePath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {serve: ['path1']}));
    })
    it('addViewPath', ()=>{
      chai.assert.throws(()=>srv.addViewPath(), 'first and other params must be a string');
      chai.assert.throws(()=>srv.addViewPath([1]), 'first and other params must be a string');
      chai.assert.deepEqual(srv.addViewPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {views: ['path1']}));
    })
  })

  describe('init module', ()=>{
    let mod;
    let obj = {
      __meta: null,
      __init: null
    };
    let func = ()=>{};


    it('module', ()=>{
      chai.assert.isNotNull(index.module);
      chai.assert.doesNotThrow(()=>mod = index.module());
    })

    it('default config', ()=>{
      chai.assert.deepEqual(mod.__moduleInfo, obj);
    })

    it('getLog', ()=>{
      chai.assert.throws(()=>mod.getLog(), "first param must be a string");
      let log1 = mod.getLog('test');
      chai.assert.isNotNull(log1);
      chai.assert.deepEqual(log1, mod.getLog('test'));
    })

    it('setMeta', ()=>{
      chai.assert.throws(()=>mod.setMeta(), 'first param must be an object');
      chai.assert.deepEqual(mod.setMeta({test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {__meta: {test: true}}));
      mod.setMeta(null);
    })

    it('setInit', ()=>{
      chai.assert.throws(()=>mod.setInit(), 'first param must be an object');
      chai.assert.deepEqual(mod.setInit({test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {__init: {test: true}}));
      mod.setInit(null);
    })

    it('addMethod', ()=>{
      chai.assert.throws(()=>mod.addMethod('test', null, 'string'), "third param must be a function");
      chai.assert.throws(()=>mod.addMethod('test'), "third param must be a function");
      chai.assert.throws(()=>mod.addMethod('test', 'info', func), "second param must be an object");

      chai.assert.deepEqual(mod.addMethod('test', null, func), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}, test: func}));
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('add', ()=>{
      chai.assert.throws(()=>mod.add('test', null, 'string'), "third param must be a function");
      chai.assert.throws(()=>mod.add('test'), "third param must be a function");
      chai.assert.throws(()=>mod.add('test', 'info', func), "second param must be an object");

      chai.assert.deepEqual(mod.addMethod('test', null, func), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}, test: func}));
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('setMethodInfo', ()=>{
      chai.assert.throws(()=>mod.setMethodInfo('test', 1), 'second param must be an object');
      delete mod.__moduleInfo._test;
      chai.assert.deepEqual(mod.setMethodInfo('test', {test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {test: true}}));
      delete mod.__moduleInfo._test;
      mod.setMethodInfo('test');
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}}));
      delete mod.__moduleInfo._test;
    })

    it('info', ()=>{
      chai.assert.deepEqual(mod.info('test', {test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {test: true}}));
      delete mod.__moduleInfo._test;
    })

    it('getMethod', ()=>{
      chai.assert.isUndefined(mod.getMethod('test'));
      mod.add('test', {}, func);
      chai.assert.deepEqual(mod.getMethod('test'), func);
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('getMethodInfo', ()=>{
      chai.assert.isUndefined(mod.getMethodInfo('test'));
      chai.assert.deepEqual(mod.getMethodInfo('test', true), {});
      mod.setMeta({test: true})
      chai.assert.isUndefined(mod.getMethodInfo('test'));
      chai.assert.deepEqual(mod.getMethodInfo('test', true), {test: true});
      mod.add('test', {test1: true}, func);
      chai.assert.deepEqual(mod.getMethodInfo('test'), {test1: true});
      chai.assert.deepEqual(mod.getMethodInfo('test', true), {test: true, test1: true});
      mod.setMeta(null);
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })
  })
});