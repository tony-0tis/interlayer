const assert=require('assert');
const {EventEmitter}=require('events');
const rewire=require('rewire');
const sinon=require('sinon');
const {sandbox,log}=require('../support');
require('../init');

describe('HTTP server branches',function(){
  let module,server,clock,files,inits,previousLogger,config,contexts;
  beforeEach(function(){
    clock=sinon.useFakeTimers();files=sandbox();previousLogger=global.logger;global.logger=log;
    module=rewire('../../system/server');server=new EventEmitter();server.listen=sinon.spy();contexts=[];
    inits={dal:{},mail:{},i18n:{},serve:[],modules:{modules:{},info:[],inits:{}},middlewares:{middlewares:[],inits:{}}};
    const modify=module.__get__('modifyRequestUtils');
    module.__set__({createHttpServer:()=>server,initInits:()=>inits,modifyRequestUtils:(...args)=>{contexts.push(args[0]);return modify(...args);}});
    config={port:1234,timeout:1,views:[files.root]};
  });
  afterEach(function(){for(const context of contexts) if(!context.cleared)context._lifecycle.timeout();clock.restore();global.logger=previousLogger;files.close();});
  function request(path,options={}){
    const req=new EventEmitter();req.socket={setNoDelay:sinon.spy()};req.connection={remoteAddress:'127.0.0.1'};Object.assign(req,{url:path,method:'GET',headers:{}},options);
    const res=new EventEmitter();res.body='';res.writeHead=(code,headers)=>{res.statusCode=code;res.headers=headers;res.headersSent=true;};res.write=chunk=>res.body+=chunk;
    res.end=chunk=>{if(chunk)res.body+=chunk;res.writableEnded=true;res.writableFinished=true;res.emit('finish');};
    server.emit('request',req,res);return {req,res,context:contexts.at(-1)};
  }
  function route(name,func,meta={}){inits.modules.modules[name]={func,meta};}
  it('creates TLS and websocket servers and runs initializers',function(){
    let tls,websocket,ran=0;
    module.__set__({createHttpsServer:options=>{tls=options;return server;},readFileSync:file=>Buffer.from(file),WebSocketServer:function(options){websocket=options;},processInitsUtils:()=>ran++});
    config.secure={key:'key.pem',cert:'cert.pem'};config.websocket=true;config.startInits=true;module.initServer(config);
    assert.strictEqual(tls.key.toString(),'key.pem');assert.strictEqual(websocket.server,server);assert.strictEqual(ran,1);
    config.websocket={port:9000};module.initServer(config);assert.strictEqual(websocket.port,9000);
  });
  it('returns service unavailable during shutdown with a Retry-After header',function(){
    module.initServer(config);module.__get__('iServer').gracefulShutdownInited=Date.now()||1;
    const {res}=request('/anything');assert.strictEqual(res.statusCode,503);assert.strictEqual(res.headers['Retry-After'],10);
  });
  it('uses custom 404 pages or fallback when a view is missing',async function(){
    files.write('404.html','custom not found');config.useHttpErrorFiles=true;module.initServer(config);
    const result=request('/missing');await clock.tickAsync(0);await new Promise(resolve=>require('fs').readFile(files.root+'/404.html',()=>resolve()));
    // File I/O callbacks are outside fake timers; wait for this response explicitly.
    if(!result.res.writableFinished)await new Promise(resolve=>result.res.once('finish',resolve));
    assert.strictEqual(result.res.statusCode,404);assert.strictEqual(result.res.body,'custom not found');
    config.views=[];const fallback=request('/missing');assert.strictEqual(fallback.res.statusCode,404);assert.match(fallback.res.body,/Not found/);
  });
  it('serves a directory index and skips unreadable/nonexistent paths',async function(){
    files.write('static/index.html','index');inits.serve=[files.root+'/absent',files.root+'/static'];module.initServer(config);
    const {res}=request('/');if(!res.writableFinished)await new Promise(resolve=>res.once('finish',resolve));
    assert.strictEqual(res.statusCode,200);assert.strictEqual(res.body,'index');
  });
  it('parses fields/files and returns upload errors using their HTTP status',function(){
    let parseError=null;module.__set__('formidable',()=>({parse:(req,cb)=>cb(parseError,{field:['value']},{file:{name:'upload'}})}));
    route('post',(req,cb)=>{assert.deepStrictEqual(req.files,{file:{name:'upload'}});cb(null,req.post);},{toJson:true});module.initServer(config);
    const success=request('/post',{method:'POST',headers:{'content-type':'multipart/form-data'}});assert.strictEqual(success.res.statusCode,200);assert.deepStrictEqual(JSON.parse(success.res.body),{field:['value']});
    parseError=Object.assign(Error('too large'),{httpCode:413});const failure=request('/post',{method:'POST',headers:{'content-type':'multipart/form-data'}});assert.strictEqual(failure.res.statusCode,413);
  });
  it('skips body parsing by configuration and catches handler exceptions',function(){
    config.skipParsePost=true;route('crash',()=>{throw Error('handler failed');},{toJson:true,noDelay:false});module.initServer(config);
    const {res,req}=request('/crash');assert.strictEqual(res.statusCode,200);assert.strictEqual(JSON.parse(res.body).error.message,undefined);assert(req.socket.setNoDelay.calledWith(false));
  });
  it('times out responses that sent headers without taking raw ownership',function(){
    route('stream',(req)=>{const raw=req.getRequest();raw.saved=true;});
    module.initServer(config);const result=request('/stream');result.res.writeHead(200,{});result.res.write('partial');clock.tick(1000);
    assert.strictEqual(result.res.statusCode,200);assert.strictEqual(result.res.body,'partial');assert.strictEqual(result.context.signal.reason,'timeout');assert.strictEqual(result.context.cleared,true);
  });
  it('handles matching middleware triggers and skips nonmatching ones',function(){
    const calls=[];inits.middlewares.middlewares=[{triggers:{'meta.auth':(req,meta,cb)=>{calls.push('auth');cb();},'request.path':(req,meta,cb)=>{calls.push('path');cb();},'meta.missing':()=>calls.push('bad')}}];
    route('secured',(req,cb)=>cb(null,'ok'),{auth:true});module.initServer(config);assert.strictEqual(request('/secured').res.body,'ok');assert.deepStrictEqual(calls,['auth','path']);
  });
  it('preserves middleware rejection status for a non-wildcard trigger',function(){
    inits.middlewares.middlewares=[{triggers:{'meta.auth':(req,meta,cb)=>cb('DENIED',null,403,{'Content-Type':'application/json','x-denied':'yes'})}}];
    route('secured',()=>assert.fail('must not run'),{auth:true});module.initServer(config);const {res}=request('/secured');assert.strictEqual(res.statusCode,403);assert.strictEqual(res.headers['x-denied'],'yes');
  });
  it('returns polling IDs and retrieves results or rejects an unknown ID',function(){
    route('work',(req,cb)=>cb(null,{done:true}),{toJson:true});module.initServer(config);
    const first=request('/work?withPooling=true');const id=JSON.parse(first.res.body).poolingId;assert.strictEqual(typeof id,'string');
    const second=request('/work?poolingId='+id);assert.deepStrictEqual(JSON.parse(second.res.body),{done:true});
    assert.strictEqual(JSON.parse(request('/work?poolingId=missing').res.body).error,'BAD_POOL_ID');
  });
  it('logs before initialization and exits immediately or after locks clear',function(){
    const stub=sinon.stub(console,'log');try{module.serverLog('before');assert(stub.calledOnce);}finally{stub.restore();}
    const exits=[];module.__set__('process',{exit:code=>exits.push(code)});module.graceful_shutdown(4);assert.deepStrictEqual(exits,[4]);
    const cls=module.__get__('iServer');cls.processLocks.job=true;cls.instantShutdownDelay=100;module.graceful_shutdown(5);module.graceful_shutdown(6);clock.tick(50);assert.strictEqual(exits.length,1);clock.tick(50);assert.deepStrictEqual(exits,[4,5]);
  });
  it('stops processing on an unexpected body parser error',function(){
    module.__set__('formidable',()=>({parse:(req,cb)=>cb(Error('parse failed'))}));
    route('parse',()=>assert.fail('invalid body must not run the module'));module.initServer(config);
    const {res}=request('/parse',{method:'POST',headers:{'content-type':'application/json'}});assert.strictEqual(res.statusCode,503);
  });
  it('returns 404 with disabled static serving or empty configured roots',function(){
    inits.serve=null;module.initServer(config);assert.strictEqual(request('/missing').res.statusCode,404);
    inits.serve=[''];assert.strictEqual(request('/missing').res.statusCode,404);
  });
  it('handles static files disappearing or failing to read after stat',function(){
    files.write('file.txt','data');inits.serve=[files.root];module.initServer(config);
    module.__set__('realpathSync',()=>{throw Error('file disappeared');});assert.strictEqual(request('/file.txt').res.statusCode,404);
    module.__set__('realpathSync',path=>path);
    module.__set__('modifyRequestUtils',(...args)=>{
      const modify=require('../../system/utils').modifyRequestUtils;contexts.push(args[0]);const result=modify(...args);args[0].getFile=(file,cb)=>cb(Error('read failed'));return result;
    });
    assert.strictEqual(request('/file.txt').res.statusCode,404);
  });

  for(const kind of ['middleware','prerun']){
    for(const asynchronous of [false,true]){
      it(`returns 503 for ${asynchronous ? 'rejected promises' : 'exceptions'} in ${kind}`,async function(){
        const hook=()=>{if(asynchronous)return Promise.reject(Error('hook failed'));throw Error('hook failed');};
        if(kind==='middleware')inits.middlewares.middlewares=[{triggers:{'*':hook}}];
        route('hook',()=>assert.fail('failed hook must stop the handler'),kind==='prerun'?{prerun:hook}:{});
        module.initServer(config);const {res}=request('/hook');await clock.tickAsync(0);
        assert.strictEqual(res.statusCode,503);assert.deepStrictEqual(JSON.parse(res.body),{error:'INTERNAL_ERROR'});
      });
    }
    it(`ignores duplicate ${kind} callbacks and runs the module once`,function(){
      let runs=0;const hook=(req,meta,cb)=>{cb();cb('LATE_DENIAL',null,403);};
      if(kind==='middleware')inits.middlewares.middlewares=[{triggers:{'*':hook}}];
      route('duplicate',(req,cb)=>{runs++;cb(null,'ok');},kind==='prerun'?{prerun:hook}:{});
      module.initServer(config);const {res}=request('/duplicate');assert.strictEqual(res.body,'ok');assert.strictEqual(runs,1);
    });
    it(`ignores a late ${kind} result after the client disconnects`,function(){
      let complete;let runs=0;const hook=(req,meta,cb)=>{complete=cb;};
      if(kind==='middleware')inits.middlewares.middlewares=[{triggers:{'*':hook}}];
      route('pending',()=>runs++,kind==='prerun'?{prerun:hook}:{});
      module.initServer(config);const {req,res,context}=request('/pending');req.aborted=true;res.destroyed=true;req.emit('aborted');
      complete();complete('DENIED',null,403);clock.tick(20000);
      assert.strictEqual(runs,0);assert.strictEqual(context.cleared,true);assert.strictEqual(context.signal.reason,'disconnect');assert.strictEqual(res.body,'');
      assert.deepStrictEqual(context.getBackgroundContext().DAL,{});assert.deepStrictEqual(module.__get__('iServer').processLocks,{});
    });
    it(`does not run later stages when ${kind} sends its own response`,function(){
      const hook=(req,meta,cb)=>{req.end('already handled',202);cb();};
      if(kind==='middleware')inits.middlewares.middlewares=[{triggers:{'*':hook}}];
      route('handled',()=>assert.fail('response ended'),kind==='prerun'?{prerun:hook}:{});
      module.initServer(config);const {res}=request('/handled');clock.tick(20000);assert.strictEqual(res.statusCode,202);assert.strictEqual(res.body,'already handled');
    });
  }
  it('supports nested and unrelated middleware triggers without running nonmatching functions',function(){
    let called=0;inits.middlewares.middlewares=[{triggers:{'unrelated':()=>assert.fail('not a trigger'),'meta.auth.enabled':(req,meta,cb)=>{called++;cb();},'request.params.missing':()=>assert.fail('missing value')}}];
    route('nested',(req,cb)=>cb(null,'ok'),{auth:{enabled:true}});module.initServer(config);assert.strictEqual(request('/nested').res.body,'ok');assert.strictEqual(called,1);
  });
  it('uses middleware and prerun error defaults when a hook omits HTTP status',function(){
    route('denied',()=>assert.fail('denied'),{prerun:(req,meta,cb)=>cb('DENIED')});module.initServer(config);assert.strictEqual(request('/denied').res.statusCode,200);
    inits.middlewares.middlewares=[{triggers:{'*':(req,meta,cb)=>cb('DENIED')}}];assert.strictEqual(request('/denied').res.statusCode,200);
  });
  it('rejects a NUL path and ignores requests already aborted or destroyed on arrival',function(){
    route('early',()=>assert.fail('already disconnected'));module.initServer(config);
    assert.strictEqual(request('/%00').res.statusCode,400);
    for(const state of [{aborted:true},{destroyed:true,complete:false}]){
      const {res,context}=request('/early',state);assert.strictEqual(context.cleared,true);assert.strictEqual(context.signal.reason,'disconnect');assert.strictEqual(res.body,'');
    }
  });
  it('takes IP addresses from forwarded headers or available socket fields',function(){
    route('ip',(req,cb)=>cb(null,req.ip),{skipRequestLog:true});module.initServer(config);
    assert.strictEqual(request('/ip',{headers:{'x-forwarded-for':'proxy'}}).res.body,'proxy');
    assert.strictEqual(request('/ip',{connection:undefined,socket:{remoteAddress:'socket',setNoDelay(){}}}).res.body,'socket');
    assert.strictEqual(request('/ip',{connection:{socket:{remoteAddress:'nested'}}}).res.body,'nested');
  });
  it('uses an ephemeral port when port is zero, otherwise the default port',function(){
    config.port=0;module.initServer(config);assert(server.listen.calledWith(0));delete config.port;module.initServer(config);assert(server.listen.calledWith(8080));
  });
  it('cleans up a raw SSE disconnect and ignores late writes through end',function(){
    let raw;route('sse',req=>{raw=req.getResponse();raw.writeHead(200,{});raw.write('event');});module.initServer(config);
    const {res,context}=request('/sse');clock.tick(5000);assert.strictEqual(context.cleared,false);res.destroyed=true;res.emit('close');
    assert.strictEqual(context.cleared,true);assert.strictEqual(context.signal.reason,'disconnect');raw.end('late');assert.strictEqual(res.body,'event');
    let terminal=0;context._lifecycle.onTerminal(()=>terminal++);context._lifecycle.timeout();context.getResponse();assert.strictEqual(terminal,1);
  });
  it('ignores parser callbacks after a POST disconnect and catches synchronous parser setup failures',function(){
    let parsed;module.__set__('formidable',()=>({parse:(req,cb)=>{parsed=cb;}}));route('post',()=>assert.fail('disconnected body'));
    module.initServer(config);const {req,res,context}=request('/post',{method:'POST',headers:{'content-type':'application/json'}});
    req.emit('aborted');parsed(null,{late:true},{});parsed(Error('late error'));assert.strictEqual(context.cleared,true);assert.strictEqual(res.body,'');
    module.__set__('formidable',()=>{throw Error('invalid parser options');});assert.strictEqual(request('/post',{headers:{'content-type':'application/json'}}).res.statusCode,503);
  });
  it('ignores a 404 view callback that arrives after the client disconnects',function(){
    let read;config.useHttpErrorFiles=true;module.__set__('modifyRequestUtils',(...args)=>{
      contexts.push(args[0]);const result=require('../../system/utils').modifyRequestUtils(...args);args[0].getView=(name,cb)=>{read=cb;};return result;
    });module.initServer(config);const {req,res,context}=request('/not-found');req.emit('aborted');read(null,'late view',{});assert.strictEqual(res.body,'');assert.strictEqual(context.cleared,true);
  });

});
