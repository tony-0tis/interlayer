const assert=require('assert');
const {EventEmitter}=require('events');
const rewire=require('rewire');
const sinon=require('sinon');
const {log}=require('../support');
require('../init');

describe('cluster control',function(){
  let module,cluster,clock,exits,changes,forks,worker,messages,kills;
  beforeEach(function(){
    clock=sinon.useFakeTimers();module=rewire('../../system/cluster');cluster=new EventEmitter();exits=[];forks=0;messages=[];kills=[];
    worker={send:message=>messages.push(message),kill:()=>kills.push('reload'),process:{pid:123,kill:signal=>kills.push(signal)}};
    cluster.workers={1:worker};cluster.setupPrimary=options=>assert.match(options.exec,/index.js$/);cluster.fork=()=>{forks++;return worker;};
    module.__set__({cluster,process:{env:{},exit:code=>exits.push(code)},startWatchUtils:(logger,config,onChange)=>{changes=onChange;}});
  });
  afterEach(()=>clock.restore());
  it('starts workers, configures online workers and respawns unexpected exits',function(){
    assert.strictEqual(module.stopCluster(),false);module.initCluster({workers:2});assert.strictEqual(forks,2);
    cluster.emit('online',worker);assert.strictEqual(messages[0].type,'startServerInWorker');
    cluster.emit('exit',worker,1,'SIGTERM');assert.strictEqual(forks,3);
  });
  it('rejects startup inside a worker and supports the older setupMaster API',function(){
    cluster.isWorker=true;module.initCluster({workers:1});assert.strictEqual(forks,0);
    cluster.isWorker=false;cluster.setupMaster=cluster.setupPrimary;cluster.setupPrimary=undefined;module.initCluster({workers:1});assert.strictEqual(forks,1);
  });
  it('debounces source reloads then replaces workers',function(){
    module.initCluster({workers:1,restartOnChange:true});changes();clock.tick(1000);changes();clock.tick(1000);assert.deepStrictEqual(kills,[]);
    clock.tick(500);assert.deepStrictEqual(kills,['reload']);
  });
  it('stops once and waits for workers without respawning them',function(){
    module.initCluster({workers:1});assert.strictEqual(module.stopCluster(7),true);module.stopCluster(7);
    assert.strictEqual(messages.length,1);assert.strictEqual(messages[0].type,'clusterStopped');
    cluster.emit('exit',worker,0,null);assert.strictEqual(forks,1);cluster.workers={};clock.tick(50);assert.deepStrictEqual(exits,[7]);
  });
  it('kills stuck workers when the shutdown deadline expires',function(){
    module.initCluster({workers:1,instantShutdownDelay:100});module.stopCluster(3);clock.tick(50);assert.deepStrictEqual(exits,[]);clock.tick(50);
    assert.deepStrictEqual(kills,['SIGKILL']);assert.deepStrictEqual(exits,[3]);
  });
});
