const assert=require('assert');
const {EventEmitter}=require('events');
const rewire=require('rewire');
const sinon=require('sinon');
const {sandbox,log}=require('../support');
require('../init');
const utils=require('../../system/utils');

describe('utility behavior',function(){
  let files;
  beforeEach(()=>{files=sandbox();});afterEach(()=>files.close());
  function context(inits={}){return Object.assign({id:'unit',config:{views:[files.root]},langs:['fr','en'],responseCookies:{}},utils.getProcessFunctionsUtils({}, {i18n:{en:{hello:'Hello'}},modules:{info:[]},...inits}));}
  it('normalizes existing paths and validates configuration types',function(){
    const config={views:[files.root,files.root,'missing']};const stub=sinon.stub(console,'log');
    try{
      utils.checkPathUtils(files.root,config,'views');assert.deepStrictEqual(config.views,[files.root]);
      files.write('notdir','x');utils.checkPathUtils(files.root,{views:['notdir']},'views');
      const defaults={};utils.checkPathUtils(files.root,defaults,'serve','.');assert.deepStrictEqual(defaults.serve,[files.root]);
      assert.throws(()=>utils.checkPathUtils(files.root,{views:'bad'},'views'),/must be Array/);
    }finally{stub.restore();}
  });
  it('resolves explicit/root URLs, routes, slash normalization and wildcard routes',function(){
    assert.strictEqual(utils.getUrlUtils('m','run',{},{}),'m/run');
    assert.strictEqual(utils.getUrlUtils('m','run',{}, {path:'custom'}),'m/custom');
    assert.strictEqual(utils.getUrlUtils('m','run',{addToRoot:true},{}),'run');
    const exact={func(){}};const wild={func(){}};const routes={modules:{'m/run':exact,'m/*':wild}};
    assert.strictEqual(utils.getModuleUtils(routes,'/m/run/'),exact);
    assert.strictEqual(utils.getModuleUtils(routes,'m/other'),wild);
    assert.strictEqual(utils.getModuleUtils(routes,'absent'),false);
    assert.strictEqual(utils.mime('FILE.JSON'),'application/json');assert.strictEqual(utils.mime('a.unknown','custom'),'custom');
    assert.strictEqual(utils.mime('no-extension'),'application/octet-stream');
    function root(){return utils.getRootPathUtils(new Error());}
    assert(root().includes('test'));
  });
  it('applies a valid meta.path before deciding whether the method belongs at the root',function(){
    assert.strictEqual(utils.getUrlUtils('module','run',{}, {path:'custom/path'}),'module/custom/path');
    assert.strictEqual(utils.getUrlUtils('module','run',{addToRoot:true}, {path:'custom/path'}),'custom/path');
    assert.strictEqual(utils.getUrlUtils('module','run',{}, {path:'custom/path',addToRoot:true}),'custom/path');
    for(const path of ['',null,42,'bad path','путь','custom?query']){
      assert.strictEqual(utils.getUrlUtils('module','run',{}, {path}),'module/run');
      assert.strictEqual(utils.getUrlUtils('module','run',{}, {path,addToRoot:true}),'run');
    }
  });
  it('does not destroy hidden API metadata when requesting a public listing',function(){
    const info=[{name:'a',methods:[{url:'a/open'},{url:'a/secret',hidden:true}]},{name:'b',hidden:true,methods:[{url:'b'}]},{name:'empty',methods:[]}];
    const ctx=context({modules:{info}});
    assert.strictEqual(ctx.getMethodsInfo().length,1);assert.strictEqual(ctx.getMethodsInfo()[0].methods.length,1);
    assert.strictEqual(ctx.getMethodsInfo(true).length,2);assert.strictEqual(ctx.getMethodsInfo(true)[0].methods.length,2);
    assert.strictEqual(info[0].methods.length,2);
  });
  it('translates, validates schemas, serializes JSON and redacts a cloned object',function(){
    const ctx=context();assert.strictEqual(ctx.i18n('hello'),'Hello');assert.strictEqual(ctx.i18n('missing','fallback'),'fallback');
    assert.deepStrictEqual(ctx.obtainI18n(),{en:{hello:'Hello'}});
    const input={token:'secret',nested:{x:1}};assert.strictEqual(ctx.helpers.clearObj(input,['token']),'{"nested":{"x":1}}');assert.strictEqual(input.token,'secret');
    assert.strictEqual(ctx.helpers.clearObj(null), '{}');assert.strictEqual(ctx.helpers.isBoolean('FALSE'),true);assert.strictEqual(ctx.helpers.isBoolean('0'),false);
    assert.strictEqual(ctx.helpers.JSV({x:1},{type:'object',properties:{x:{type:'number'}}}).errors.length,0);
    assert(ctx.helpers.JSV({x:'bad'},{type:'object',properties:{x:{type:'number'}}}).errors.length>0);
    const result={data:{ok:true},headers:{}};ctx.helpers.toJson(result);assert.strictEqual(result.data,'{"ok":true}');
    const cyclic={};cyclic.self=cyclic;ctx.helpers.toJson({data:cyclic,headers:{}});assert.strictEqual(ctx.helpers.clearObj(cyclic), '');
    ctx.addCookie('name','value');ctx.rmCookie('name');assert.strictEqual(ctx.responseCookies.name,'');
  });
  it('loads files and views and reports missing/non-file paths',async function(){
    const ctx=context();const file=files.write('file.txt','hello');
    const read=(method,...args)=>new Promise(resolve=>ctx[method](...args,(...res)=>resolve(res)));
    assert.deepStrictEqual(await read('getFile',file),[null,Buffer.from('hello'),{'Content-Type':'text/plain'}]);
    assert.strictEqual((await read('getFile',files.root))[0],'NOT FILE');assert.strictEqual((await read('getFile',file+'missing'))[0],'NO FILE');
    assert.strictEqual((await read('getView','absent'))[0],'Not found');assert.strictEqual((await read('getView','unused','file.txt'))[1],'hello');
    assert.strictEqual(ctx.getViewSync('unused','file.txt'),'hello');assert.strictEqual(ctx.getViewSync('absent'),null);
    assert.throws(()=>ctx.getView('alone'),/minimum/);
    ctx.config.views=[];assert.strictEqual(ctx.getViewSync('a'),'NO config.views');assert.strictEqual((await read('getView','a'))[0],'NO config.views');
  });
  it('returns fallback or custom service error pages',async function(){
    const ctx=context();let response;ctx.end=(...args)=>response=args;
    ctx.error('failure');assert.strictEqual(response[1],503);
    ctx.config.useHttpErrorFiles=true;
    await new Promise(resolve=>{ctx.end=(...args)=>{response=args;resolve();};ctx.error('missing view');});assert.strictEqual(response[1],503);
    files.write('502.html','custom error');
    await new Promise(resolve=>{ctx.end=(...args)=>{response=args;resolve();};ctx.error('custom');});assert.strictEqual(response[0],'custom error');
    delete ctx.end;ctx.error('already cleaned');
    assert.throws(()=>ctx.modifyLog(),/specify log/);
    assert.throws(()=>ctx.modifyLog(ctx.modifyLog(log())),/twice/);
  });
  it('runs module and middleware initializers even if one fails',function(){
    const called=[];const stub=sinon.stub(console,'error');
    try{
      utils.processInitsUtils({modules:{inits:{a(ctx,cb){called.push(ctx);cb();},bad(){throw Error('init failed');}}},middlewares:{inits:{a(ctx){called.push(ctx);},b(ctx){called.push(ctx);}}},dal:{query(){}},mail:{}},{test:true},'ws',{helper(){}});
      assert.strictEqual(called.length,3);assert.strictEqual(called[0].websocket,'ws');assert.strictEqual(typeof called[0].helper,'function');assert(stub.calledOnce);
    }finally{stub.restore();}
  });

  function httpContext(){
    const req=new EventEmitter(),res=new EventEmitter(),locks={};const body=[];
    res.writeHead=(code,headers)=>{res.statusCode=code;res.headers=headers;res.headersSent=true;};res.write=chunk=>body.push(Buffer.from(chunk));
    res.end=()=>{res.writableEnded=true;res.writableFinished=true;res.emit('finish');};
    const ctx={id:'http-unit',config:{defaultHeaders:{'x-app':'test'}},DAL:{query(){}},mail:{},params:{},cookies:{},responseCookies:{},headers:{},langs:['en']};
    utils.modifyRequestUtils(ctx,req,res,utils.getProcessFunctionsUtils(locks,{i18n:{en:{hello:'Hello'}},modules:{info:[]}}),log());
    return {ctx,req,res,locks,body};
  }
  for(const value of [12,true,false,null,undefined,Symbol('x'),{ok:true},Buffer.from('abc')]){
    it(`serializes response value ${String(value)} and cleans locks`,function(){
      const {ctx,res,locks,body}=httpContext();ctx.end(value);
      assert.strictEqual(ctx.cleared,true);assert.deepStrictEqual(locks,{});assert.strictEqual(res.headers['x-app'],'test');
      assert.strictEqual(Number(res.headers['content-length']),Buffer.concat(body).length);
    });
  }
  it('encodes response cookies and preserves binary data',function(){
    const {ctx,res,body}=httpContext();ctx.addCookie('name','a b');ctx.end(Buffer.from([0,255]),201,{'CONTENT-TYPE':'application/octet-stream'},'bin');
    assert.strictEqual(res.statusCode,201);assert.deepStrictEqual(Buffer.concat(body),Buffer.from([0,255]));assert.match(res.headers['set-cookie'][0],/^name=a%20b;/);
  });
  for(const reason of ['timeout','disconnect']){
    it(`keeps detached services after ${reason} without retaining HTTP capabilities`,function(){
      const {ctx,req,res,locks}=httpContext();const bg=ctx.getBackgroundContext();const release=bg.lockBackground();
      if(reason==='timeout')ctx._lifecycle.timeout();else req.emit('aborted');
      assert.strictEqual(ctx.cleared,true);assert.strictEqual(ctx.DAL,undefined);assert.strictEqual(typeof bg.DAL.query,'function');
      assert.strictEqual(bg.i18n('hello'),'Hello');bg.log.i('after cleanup');assert.strictEqual(ctx.getBackgroundContext().DAL,bg.DAL);
      assert.strictEqual(bg.getResponse,undefined);assert.strictEqual(bg.signal,undefined);assert.strictEqual(Object.keys(locks).length,1);release();release();assert.deepStrictEqual(locks,{});
      if(reason==='timeout')assert.strictEqual(res.statusCode,408);
    });
  }
  it('watches nested source directories and filters editor/log noise',function(){
    const module=rewire('../../system/utils');const events={},watched=[];let changes=0;
    module.__set__({watch:(path,cb)=>{events[path]=cb;watched.push(path);},readdirSync:path=>path==='/root'?['child','file.js','node_modules','.git','logs','broken']:[],stat:(path,cb)=>path.endsWith('broken')?cb(Error('stat')):cb(null,{isDirectory:()=>path.endsWith('child')})});
    module.startWatchUtils(log(),{modules:['/root'],dals:[],middleware:[],i18n:[],emailSenders:[]},()=>changes++);
    assert.deepStrictEqual(watched,['/root','/root/child']);
    for(const file of [null,'a.log','README','a.swp','a.swx','a.js~','.gitignore'])events['/root']('change',file);
    assert.strictEqual(changes,0);events['/root']('change','index.js');assert.strictEqual(changes,1);
  });
  it('parses cookie values including equals signs and percent encodings',function(){
    const module=rewire('../../system/utils');const req=new EventEmitter(),res=new EventEmitter();res.end=()=>{};
    const ctx={id:'cookies',config:{},params:{},headers:{cookie:'a=hello%20world; b=x=y'},cookies:{}};
    module.modifyRequestUtils(ctx,req,res,module.getProcessFunctionsUtils({},{}),log());
    assert.deepStrictEqual(ctx.cookies,{a:'hello world',b:'x=y'});res.emit('finish');
  });
  it('cleans up on response close and safely ends an already started response',function(){
    const first=httpContext();first.res.emit('close');assert.strictEqual(first.ctx.signal.reason,'disconnect');assert.strictEqual(first.ctx.cleared,true);
    const completed=httpContext();completed.res.writableFinished=true;completed.res.emit('close');assert.strictEqual(completed.ctx.cleared,true);
    const second=httpContext();second.res.writeHead(200,{});second.ctx.end('ignored');assert.strictEqual(second.ctx.cleared,true);
    const third=httpContext();third.res.destroyed=true;third.ctx._lifecycle.timeout();assert.strictEqual(third.ctx.cleared,true);
  });
  it('automatically releases an expired shutdown lock',function(){
    const clock=sinon.useFakeTimers();try{const {ctx,locks,res}=httpContext();ctx.lockShutdown(20);clock.tick(19);assert.strictEqual(locks['http-unit'],true);clock.tick(1);assert.deepStrictEqual(locks,{});res.emit('finish');}finally{clock.restore();}
  });
  it('returns read failures via callbacks and sync views use the next available directory',async function(){
    const module=rewire('../../system/utils');module.__set__({statSync:()=>({isFile:()=>true}),readFile:(path,cb)=>cb(Error('disk failure'))});
    const ctx=Object.assign({id:'read',config:{}},module.getProcessFunctionsUtils({},{}));
    await new Promise(resolve=>ctx.getFile('a.txt',err=>{assert.strictEqual(err,'BAD FILE');resolve();}));
    module.__set__({statSync:path=>({isFile:()=>!path.includes('directory')}),readFileSync:path=>{if(path.includes('bad'))throw Error('disk');return 'valid';}});
    ctx.config.views=['directory','bad','good'];assert.strictEqual(ctx.getViewSync('file'),'valid');ctx.config.views.push('unused');assert.strictEqual(ctx.getViewSync('file'),'valid');
  });

});
