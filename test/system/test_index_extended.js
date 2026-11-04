const assert=require('assert');
const {EventEmitter}=require('events');
const rewire=require('rewire');
const sinon=require('sinon');
const {sandbox,log}=require('../support');
require('../init');

describe('startup, process signals and scheduler',function(){
  let index,files,previousIntervals,handlers,clock,processStub,started;
  beforeEach(function(){
    files=sandbox();previousIntervals=global.intervals;const before=new Map(process.eventNames().map(name=>[name,process.listeners(name)]));
    clock=sinon.useFakeTimers();index=rewire('../../index');handlers={};
    for(const name of process.eventNames()) for(const listener of process.listeners(name)) if(!(before.get(name)||[]).includes(listener)){
      handlers[name]=listener;process.removeListener(name,listener);
    }
    processStub={chdir:sinon.spy(),exitCode:0,pid:123};started=[];
    index.__set__({process:processStub,getRootPathUtils:()=>files.root,initLoggerUtils:()=>{},initServer:config=>started.push(['server',config]),initCluster:config=>started.push(['cluster',config]),serverLog:()=>{}});
  });
  afterEach(function(){global.intervals.stop();global.intervals=previousIntervals;clock.restore();files.close();});
  it('loads relative JSON config and schedules a standalone server with resolved paths',function(){
    files.write('config.json',JSON.stringify({port:1234,logPath:'logs',skipDbWarning:true}));index('config.json');assert.strictEqual(started.length,0);clock.tick(20);
    assert.strictEqual(started[0][0],'server');assert.strictEqual(started[0][1].port,1234);assert.strictEqual(started[0][1].logPath,files.root+'/logs');assert(processStub.chdir.calledWith(files.root));
  });
  it('selects cluster mode and validates bad config/root paths',function(){
    assert.throws(()=>index('absent.json'),/wrong config/);assert.throws(()=>index({path:'relative'}),/absolute/);
    assert.throws(()=>index({path:files.root+'/absent'}),/not created/);const file=files.write('file','x');assert.throws(()=>index({path:file}),/directory/);
    index({path:files.root,workers:2,disableNagleAlgoritm:true});clock.tick(20);assert.strictEqual(started[0][0],'cluster');
  });
  it('supports builder startup, config loading and remaining validated setters',function(){
    const server=index.server();const config=files.write('settings.json','{"port":9999}');assert.strictEqual(server.loadConfigFile(config),server);assert.strictEqual(server.getConfig().port,9999);
    server.loadConfigFile('missing');server.setSkipParsePost(true);server.setStartInits(false);server.disableLogFile(true);server.setFormidableOptions({maxFiles:1});
    assert(server.setSkipParsePost('bad') instanceof Error);assert(server.setStartInits('bad') instanceof Error);assert(server.disableLogFile('bad') instanceof Error);
    assert(server.setTimeout(0) instanceof Error);assert(server.setInstantShutdownDelay(0) instanceof Error);assert(server.setRetryAter(0) instanceof Error);assert(server.setWorkersCount(0) instanceof Error);
    assert(server.setSecure(null) instanceof Error);assert(server.setSecure({key:'x'}) instanceof Error);
    assert.strictEqual(server.setMiddlewareOrder(['a','b']),server);server.start({skipDbWarning:true});clock.tick(20);assert.strictEqual(started[0][1].port,9999);
  });
  it('routes shutdown signals/messages and ignores invalid IPC values',function(){
    const exits=[];index.__set__({stopCluster:()=>false,graceful_shutdown:code=>exits.push(code),isGracefulShutdownInited:()=>true});
    for(const signal of ['SIGINT','SIGTERM','SIGUSR1','SIGUSR2']) handlers[signal]();
    handlers.message('shutdown');handlers.message({type:'reloadWorker'});handlers.message({type:'clusterStopped'});handlers.message(null);
    handlers.message({type:'startServerInWorker',config:{port:42}});handlers.exit();
    assert.deepStrictEqual(exits,[1,undefined,undefined,undefined,1,0,1]);assert.strictEqual(started[0][1].port,42);
    const stub=sinon.stub(console,'error');try{handlers.uncaughtException(Error('oops'));assert(stub.calledOnce);}finally{stub.restore();}
  });
  it('schedules numeric tasks, disables/enables them and safely removes tasks',function(){
    const intervals=global.intervals;const warned=intervals.add(()=>{});intervals.del(warned);let calls=0;const key=intervals.add(()=>calls++,2);intervals.start();clock.tick(1000);assert.strictEqual(calls,0);clock.tick(1000);assert.strictEqual(calls,1);
    intervals.disable(key);clock.tick(3000);assert.strictEqual(calls,1);intervals.enable(key);clock.tick(1000);assert.strictEqual(calls,2);intervals.del(key);clock.tick(3000);assert.strictEqual(calls,2);
    let removed=0;intervals.add(remove=>{removed++;remove();},1);clock.tick(2000);assert.strictEqual(removed,1);
    intervals.stop();
  });
  it('matches calendar schedules and executes minute tasks once per matching minute',function(){
    const intervals=global.intervals;clock.setSystemTime(new Date(2026,10,4,12,30,0));let calls=0;
    intervals.add(()=>calls++,{year:2026,month:10,date:4,day:3,hour:12,minute:30});intervals._check();intervals._check();assert.strictEqual(calls,1);
    clock.setSystemTime(new Date(2026,10,4,12,31,0));intervals._check();clock.setSystemTime(new Date(2026,10,4,13,30,0));intervals._check();assert.strictEqual(calls,1);
    for(const field of ['year','month','date','day','hour','minute','second']) intervals.add(()=>{throw Error('must not run');},{[field]:9999});intervals._check();
  });
  it('does not skip the next due task when a task removes itself',function(){
    const intervals=global.intervals;const calls=[];
    intervals.add(remove=>{calls.push('first');remove();},0);
    intervals.add(remove=>{calls.push('second');remove();},0);
    intervals._check();assert.deepStrictEqual(calls,['first','second']);assert.deepStrictEqual(intervals._funcs,[]);
  });

  it('rejects non-finite, out-of-range and nonnumeric startup configuration',function(){
    for(const field of ['port','workers','timeout','middlewareTimeout','instantShutdownDelay','retryAter']){
      for(const value of [NaN,Infinity,-Infinity,-1,'2'])assert.throws(()=>index({[field]:value}),new RegExp('config.'+field));
    }
    for(const field of ['workers','timeout','middlewareTimeout','instantShutdownDelay','retryAter'])assert.throws(()=>index({[field]:0}),new RegExp('config.'+field));
    for(const value of [1.5,65536])assert.throws(()=>index({port:value}),/config.port/);
    assert.throws(()=>index({workers:1.5}),/config.workers/);assert.throws(()=>index(null),/config must be an object/);assert.throws(()=>index([]),/config must be an object/);
    assert.strictEqual(started.length,0);assert.strictEqual(processStub.chdir.called,false);
  });
  it('validates numeric builders before mutating their configuration',function(){
    const server=index.server();
    for(const method of ['setPort','setWorkersCount','setTimeout','setMiddlewareTimeout','setInstantShutdownDelay','setRetryAter']){
      const before={...server.getConfig()};
      for(const value of [NaN,Infinity,-Infinity,-1,'3'])assert(server[method](value) instanceof Error,method+' accepted '+value);
      assert.deepStrictEqual(server.getConfig(),before);
    }
    for(const value of [null,[],false])assert(server.setConfig(value) instanceof Error);
    for(const value of [null,[]])assert(server.setDefaultHeaders(value) instanceof Error);
    assert(server.setPort(65536) instanceof Error);assert(server.setPort(1.5) instanceof Error);assert(server.setWorkersCount(1.5) instanceof Error);
    assert(server.setMiddlewareTimeout(0) instanceof Error);assert.strictEqual(server.setPort(0),server);assert.strictEqual(server.setMiddlewareTimeout(0.01),server);
  });
  it('loads an absolute config path and starts with default configuration',function(){
    index(files.write('absolute.json',JSON.stringify({useDals:{custom:{}},skipDbWarning:true})));clock.tick(20);assert.strictEqual(started.length,1);
    index.server().start();clock.tick(20);assert.strictEqual(started.length,2);
  });
  it('does not shut down twice when the cluster handles a signal or IPC shutdown',function(){
    index.__set__({stopCluster:()=>true,graceful_shutdown:()=>assert.fail('cluster owns shutdown'),isGracefulShutdownInited:()=>true});
    for(const signal of ['SIGINT','SIGTERM','SIGUSR1','SIGUSR2'])handlers[signal]();handlers.message('shutdown');
    const intervals=global.intervals;global.intervals=null;try{handlers.exit();}finally{global.intervals=intervals;}
  });
  it('skips a task deleted by an earlier task and runs tasks with no timeout',function(){
    const intervals=global.intervals;let skipped;let calls=0;
    intervals.add(()=>{intervals.del(skipped);calls++;});skipped=intervals.add(()=>assert.fail('deleted'),0);intervals._check();assert.strictEqual(calls,1);
  });

});
