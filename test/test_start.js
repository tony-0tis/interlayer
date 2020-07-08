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
  describe('init server', ()=>{
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
      chai.assert.deepInclude(srv.setConfig(), {name: 'Error', message: 'setConfig - first param must be an object'});
      chai.assert.deepEqual(srv.setConfig({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {test: true}));
    })
    it('setRootPath', ()=>{
      chai.assert.deepInclude(srv.setRootPath(), {name: 'Error', message: 'setRootPath - first param must be a string'});
      chai.assert.deepEqual(srv.setRootPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {path: 'path1'}));
    })
    it('setLogPath', ()=>{
      chai.assert.deepInclude(srv.setLogPath(), {name: 'Error', message: 'setLogPath - first param must be a string'});
      chai.assert.deepEqual(srv.setLogPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {logPath: 'path1'}));
    })
    it('setPort', ()=>{
      chai.assert.deepInclude(srv.setPort(), {name: 'Error', message: 'setPort - first param must be a number'});
      chai.assert.deepEqual(srv.setPort(8000), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {port: 8000}));
    })
    it('setWorkersCount', ()=>{
      chai.assert.deepInclude(srv.setWorkersCount(), {name: 'Error', message: 'setWorkersCount - first param must be a number'});
      chai.assert.deepInclude(srv.setWorkersCount(0), {name: 'Error', message: 'setWorkersCount - first param must to be above zero'});
      chai.assert.deepEqual(srv.setWorkersCount(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {workers: 1}));
    })
    it('setSecure', ()=>{
      chai.assert.deepInclude(srv.setSecure(), {name: 'Error', message: 'setSecure - first param must be an object'});
      chai.assert.deepInclude(srv.setSecure({key: 1}), {name: 'Error', message: 'setSecure - first param.key must be a string'});
      chai.assert.deepInclude(srv.setSecure({key: 'path1', cert: 1}), {name: 'Error', message: 'setSecure - first param.cert must be a string'});
      chai.assert.deepEqual(srv.setSecure({key: '1', cert: '1'}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {secure: {key: '1', cert: '1'}}));
    })
    it('setWebsocketConfig', ()=>{
      chai.assert.deepInclude(srv.setWebsocketConfig(), {name: 'Error', message: 'setWebsocketConfig - first param must be an object or boolean'});
      chai.assert.deepEqual(srv.setWebsocketConfig({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {websocket: {test: true}}));
    })
    it('setDefaultHeaders', ()=>{
      chai.assert.deepInclude(srv.setDefaultHeaders(), {name: 'Error', message: 'setDefaultHeaders - first param must be an object'});
      chai.assert.deepEqual(srv.setDefaultHeaders({test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {defaultHeaders: {test: true}}));
    })
    it('setTimeout', ()=>{
      chai.assert.deepInclude(srv.setTimeout(), {name: 'Error', message: 'setTimeout - first param must be a number'});
      chai.assert.deepInclude(srv.setTimeout(0), {name: 'Error', message: 'setTimeout - first param must to be above zero'});
      chai.assert.deepEqual(srv.setTimeout(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {timeout: 1}));
    })
    it('setInstantShutdownDelay', ()=>{
      chai.assert.deepInclude(srv.setInstantShutdownDelay(), {name: 'Error', message: 'setInstantShutdownDelay - first param must be a number'});
      chai.assert.deepInclude(srv.setInstantShutdownDelay(0), {name: 'Error', message: 'setInstantShutdownDelay - first param must to be above zero'});
      chai.assert.deepEqual(srv.setInstantShutdownDelay(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {instantShutdownDelay: 1}));
    })
    it('setRetryAter', ()=>{
      chai.assert.deepInclude(srv.setRetryAter(), {name: 'Error', message: 'setRetryAter - first param must be a number'});
      chai.assert.deepInclude(srv.setRetryAter(0), {name: 'Error', message: 'setRetryAter - first param must to be above zero'});
      chai.assert.deepEqual(srv.setRetryAter(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {retryAter: 1}));
    })
    it('setRestartOnChange', ()=>{
      chai.assert.deepInclude(srv.setRestartOnChange(), {name: 'Error', message: 'setRestartOnChange - first param must be a boolean'});
      chai.assert.deepEqual(srv.setRestartOnChange(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {restartOnChange: true}));
    })
    it('setSkipDbWarning', ()=>{
      chai.assert.deepInclude(srv.setSkipDbWarning(), {name: 'Error', message: 'setSkipDbWarning - first param must be a boolean'});
      chai.assert.deepEqual(srv.setSkipDbWarning(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {skipDbWarning: true}));
    })
    it('setDebugMode', ()=>{
      chai.assert.deepInclude(srv.setDebugMode(), {name: 'Error', message: 'setDebugMode - first param must be a boolean'});
      chai.assert.deepEqual(srv.setDebugMode(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {debug: true}));
    })
    it('setNoDelay', ()=>{
      chai.assert.deepInclude(srv.setNoDelay(), {name: 'Error', message: 'setNoDelay - first param must be a boolean'});
      chai.assert.deepEqual(srv.setNoDelay(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {noDelay: true}));
    })
    it('setUseFilesAsHTTPErrors', ()=>{
      chai.assert.deepInclude(srv.setUseFilesAsHTTPErrors(), {name: 'Error', message: 'setUseFilesAsHTTPErrors - first param must be a boolean'});
      chai.assert.deepEqual(srv.setUseFilesAsHTTPErrors(true), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useHttpErrorFiles: true}));
    })
    it('setDisableNagleAlgoritm', ()=>{
      chai.assert.deepEqual(srv.setDisableNagleAlgoritm(true), srv);
      chai.assert.deepEqual(srv.__config, defaultConfig);
    })
    it('addDal', ()=>{
      chai.assert.deepInclude(srv.addDal(), {name: 'Error', message: 'addDal - first param must be a string'});
      chai.assert.deepInclude(srv.addDal('dal', 1), {name: 'Error', message: 'addDal - second param must be an object'});
      chai.assert.deepEqual(srv.addDal('dal', {test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useDals: {dal: {test: true}}}));
    })
    it('addEmailSender', ()=>{
      chai.assert.deepInclude(srv.addEmailSender(), {name: 'Error', message: 'addEmailSender - first param must be a string'});
      chai.assert.deepInclude(srv.addEmailSender('email', 1), {name: 'Error', message: 'addEmailSender - second param must be an object'});
      chai.assert.deepEqual(srv.addEmailSender('email', {test: true}), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {useEmailSenders: {email: {test: true}}}));
    })
    it('addDalPath', ()=>{
      chai.assert.deepInclude(srv.addDalPath(), {name: 'Error', message: 'addDalPath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addDalPath([1]), {name: 'Error', message: 'addDalPath - first and other params must be a string'});
      chai.assert.deepEqual(srv.addDalPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {dals: ['path1']}));
    })
    it('addMiddlewarePath', ()=>{
      chai.assert.deepInclude(srv.addMiddlewarePath(), {name: 'Error', message: 'addMiddlewarePath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addMiddlewarePath([1]), {name: 'Error', message: 'addMiddlewarePath - first and other params must be a string'});
      chai.assert.deepEqual(srv.addMiddlewarePath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middleware: ['path1']}));
    })
    it('setMiddlewareOrder', ()=>{
      chai.assert.deepInclude(srv.setMiddlewareOrder(), {name: 'Error', message: 'setMiddlewareOrder - first param must be an array of strings or first and other params must be a string'});
      chai.assert.deepInclude(srv.setMiddlewareOrder(1), {name: 'Error', message: 'setMiddlewareOrder - first param must be an array of strings or first and other params must be a string'});
      chai.assert.deepEqual(srv.setMiddlewareOrder('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middlewareOrder: ['path1']}));
    })
    it('setMiddlewareTimeout', ()=>{
      chai.assert.deepInclude(srv.setMiddlewareTimeout(), {name: 'Error', message: 'setMiddlewareTimeout - first param must be a number'});
      chai.assert.deepEqual(srv.setMiddlewareTimeout(1), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {middlewareTimeout: 1}));
    })
    it('addModulesPath', ()=>{
      chai.assert.deepInclude(srv.addModulesPath(), {name: 'Error', message: 'addModulesPath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addModulesPath([1]), {name: 'Error', message: 'addModulesPath - first and other params must be a string'});
      chai.assert.deepEqual(srv.addModulesPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {modules: ['path1']}));
    })
    it('addI18nPath', ()=>{
      chai.assert.deepInclude(srv.addI18nPath(), {name: 'Error', message: 'addI18nPath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addI18nPath([1]), {name: 'Error', message: 'addI18nPath - first and other params must be a string'});
      chai.assert.deepEqual(srv.addI18nPath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {i18n: ['path1']}));
    })
    it('addServePath', ()=>{
      chai.assert.deepInclude(srv.addServePath(), {name: 'Error', message: 'addServePath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addServePath([1]), {name: 'Error', message: 'addServePath - first and other params must be a string'});
      chai.assert.deepEqual(srv.addServePath('path1'), srv);
      chai.assert.deepEqual(srv.__config, Object.assign({}, defaultConfig, {serve: ['path1']}));
    })
    it('addViewPath', ()=>{
      chai.assert.deepInclude(srv.addViewPath(), {name: 'Error', message: 'addViewPath - first and other params must be a string'});
      chai.assert.deepInclude(srv.addViewPath([1]), {name: 'Error', message: 'addViewPath - first and other params must be a string'});
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
      chai.assert.deepInclude(mod.getLog(), {name: 'Error', message: "getLog - first param must be a string"});
      let log1 = mod.getLog('test');
      chai.assert.isNotNull(log1);
      chai.assert.deepEqual(log1, mod.getLog('test'));
    })

    it('setMeta', ()=>{
      chai.assert.deepInclude(mod.setMeta(), {name: 'Error', message: 'setMeta - first param must be an object'});
      chai.assert.deepEqual(mod.setMeta({test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {__meta: {test: true}}));
      mod.setMeta(null);
    })

    it('setInit', ()=>{
      chai.assert.deepInclude(mod.setInit(), {name: 'Error', message: 'setInit - first param must be an object'});
      chai.assert.deepEqual(mod.setInit({test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {__init: {test: true}}));
      mod.setInit(null);
    })

    it('addMethod', ()=>{
      chai.assert.deepInclude(mod.addMethod(), {name: 'Error', message: "addMethod - first param must be a string"});
      chai.assert.deepInclude(mod.addMethod('test', null, 'string'), {name: 'Error', message: "addMethod - third param must be a function"});
      chai.assert.deepInclude(mod.addMethod('test'), {name: 'Error', message: "addMethod - third param must be a function"});
      chai.assert.deepInclude(mod.addMethod('test', 'info', func), {name: 'Error', message: "addMethod - second param must be an object"});

      chai.assert.deepEqual(mod.addMethod('test', null, func), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}, test: func}));
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('add', ()=>{
      chai.assert.deepInclude(mod.add(), {name: 'Error', message: "add - first param must be a string"});
      chai.assert.deepInclude(mod.add('test', null, 'string'), {name: 'Error', message: "add - third param must be a function"});
      chai.assert.deepInclude(mod.add('test'), {name: 'Error', message: "add - third param must be a function"});
      chai.assert.deepInclude(mod.add('test', 'info', func), {name: 'Error', message: "add - second param must be an object"});

      chai.assert.deepEqual(mod.add('test', null, func), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}, test: func}));
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('setMethodInfo', ()=>{
      chai.assert.deepInclude(mod.setMethodInfo(), {name: 'Error', message: 'setMethodInfo - first param must be a string'});
      chai.assert.deepInclude(mod.setMethodInfo('test', 1), {name: 'Error', message: 'setMethodInfo - second param must be an object'});

      chai.assert.deepEqual(mod.setMethodInfo('test', {test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {test: true}}));
      delete mod.__moduleInfo._test;

      mod.setMethodInfo('test');
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {}}));
      delete mod.__moduleInfo._test;
    })

    it('info', ()=>{
      chai.assert.deepInclude(mod.info(), {name: 'Error', message: 'info - first param must be a string'});
      chai.assert.deepInclude(mod.info('test', 1), {name: 'Error', message: 'info - second param must be an object'});
      chai.assert.deepEqual(mod.info('test', {test: true}), mod);
      chai.assert.deepEqual(mod.__moduleInfo, Object.assign({}, obj, {_test: {test: true}}));
      delete mod.__moduleInfo._test;
    })

    it('getMethod', ()=>{
      chai.assert.deepInclude(mod.getMethod(), {name: 'Error', message: 'getMethod - first param must be a string'});

      chai.assert.isUndefined(mod.getMethod('test'));
      mod.add('test', {}, func);
      chai.assert.deepEqual(mod.getMethod('test'), func);
      delete mod.__moduleInfo.test;
      delete mod.__moduleInfo._test;
    })

    it('getMethodInfo', ()=>{
      chai.assert.deepInclude(mod.getMethodInfo(), {name: 'Error', message: 'getMethodInfo - first param must be a string'});

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