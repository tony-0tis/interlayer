const assert = require('assert');
const http = require('http');
const rewire = require('rewire');
require('../init');
require('../../system/server');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('HTTP lifecycle integration', function(){
  this.timeout(3000);
  let server;
  let routes;
  let restore;
  let previousLogger;
  let contexts;
  let servePaths;
  let middlewares;

  before(async function(){
    previousLogger = global.logger;
    global.logger = () => ({i(){}, d(){}, w(){}, e(){}});
    routes = {};
    middlewares = [];
    contexts = [];
    servePaths = [__dirname, __dirname];
    const module = rewire('../../system/server.js');
    const modifyRequest = module.__get__('modifyRequestUtils');
    restore = module.__set__({
      modifyRequestUtils: (...args) => {
        contexts.push(args[0]);
        const log = modifyRequest(...args);
        if(args[0].headers['x-delay-static']){
          args[0].getFile = (file, cb) => { args[0].finishStatic = cb; };
        }
        return log;
      },
      initInits: () => ({dal: {events: {save: async value => value + ':saved'}}, mail: {send: async () => 'sent'}, modules: {modules: routes, info: []}, middlewares: {middlewares}, i18n: {}, serve: servePaths}),
      createHttpServer: () => {
        server = http.createServer();
        const listen = server.listen;
        server.listen = function(){ return listen.call(this, 0, '127.0.0.1'); };
        return server;
      }
    });
    module.initServer({port: 8080, timeout: 0.05});
    await new Promise(resolve => server.once('listening', resolve));
  });

  after(function(done){
    restore();
    global.logger = previousLogger;
    server.close(done);
    server.closeAllConnections();
  });

  function request(path){
    return new Promise((resolve, reject) => {
      const req = http.get({host: '127.0.0.1', port: server.address().port, path}, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({status: res.statusCode, body}));
        res.on('error', reject);
      });
      req.setTimeout(300, () => req.destroy(new Error('client timed out')));
      req.on('error', reject);
    });
  }

  it('stops after prerun denial and preserves its status and JSON', async function(){
    let ran = false;
    routes.denied = {meta: {prerun(req, meta, cb){ cb('DENIED', null, 403); }}, func(req, cb){
      ran = true;
      cb(null, 'secret');
    }};
    const result = await request('/denied');
    assert.strictEqual(ran, false);
    assert.strictEqual(result.status, 403);
    assert.deepStrictEqual(JSON.parse(result.body), {error: 'DENIED'});
  });

  it('stops after middleware denial without running prerun or the module', async function(){
    let ran = false;
    routes.middlewareDenied = {meta: {prerun(){ ran = true; }}, func(){ ran = true; }};
    middlewares.push({triggers: {'*': (req, meta, cb) => cb('UNAUTHORIZED', null, 401)}});
    try{
      const result = await request('/middlewareDenied');
      assert.strictEqual(ran, false);
      assert.strictEqual(result.status, 401);
      assert.deepStrictEqual(JSON.parse(result.body), {error: 'UNAUTHORIZED'});
    }finally{ middlewares.pop(); }
  });

  it('returns 404 for inherited object properties used as URLs', async function(){
    for(const path of ['/toString', '/constructor', '/__proto__']){
      assert.strictEqual((await request(path)).status, 404);
    }
  });

  it('parses true and false query values without changing other strings', async function(){
    routes.booleans = {meta: {toJson: true}, func(req, cb){ cb(null, req.params); }};
    const result = await request('/booleans?yes=TRUE&no=false&mixed=FaLsE&other=hello');
    assert.deepStrictEqual(JSON.parse(result.body), {yes: true, no: false, mixed: false, other: 'hello'});
  });


  for(const trigger of ['*','meta.auth']){
    it(`stops real HTTP middleware ${trigger} on disconnect before authorization completes`,async function(){
      let complete,context,locks;let entered;const started=new Promise(resolve=>entered=resolve);let ran=false;
      middlewares.push({triggers:{[trigger]:(req,meta,cb)=>{context=req;locks=req.getProcessLocks();complete=cb;entered();}}});
      routes.cancelAuth={meta:{auth:true},func(){ran=true;}};
      const client=http.get({host:'127.0.0.1',port:server.address().port,path:'/cancelAuth'});client.on('error',()=>{});
      try{
        await started;const disconnected=new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));client.destroy();await disconnected;
        complete();complete('LATE_DENIAL',null,403);await sleep(10);
        assert.strictEqual(ran,false);assert.strictEqual(context.signal.reason,'disconnect');assert.strictEqual(context.cleared,true);assert.deepStrictEqual(locks,{});
      }finally{client.destroy();middlewares.pop();}
    });
  }
  it('rejects malformed URL and cookie encodings', async function(){
    assert.strictEqual((await request('/%')).status, 400);
    const result = await new Promise((resolve, reject) => {
      http.get({host: '127.0.0.1', port: server.address().port, path: '/', headers: {cookie: 'bad=%'}}, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.strictEqual(result, 400);
  });

  it('does not serve files outside the static root', async function(){
    assert.strictEqual((await request('/%2e%2e/%2e%2e/package.json')).status, 404);
  });

  it('serves allowed files but rejects symlinks escaping the static root', async function(){
    const {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync} = require('fs');
    const {join} = require('path');
    const {tmpdir} = require('os');
    const root = mkdtempSync(join(tmpdir(), 'interlayer-static-'));
    const publicDir = join(root, 'public');
    mkdirSync(publicDir);
    writeFileSync(join(root, 'secret.txt'), 'private');
    writeFileSync(join(publicDir, 'allowed.txt'), 'public');
    symlinkSync(join(root, 'secret.txt'), join(publicDir, 'escape.txt'));
    symlinkSync(join(publicDir, 'allowed.txt'), join(publicDir, 'internal.txt'));
    servePaths.push(publicDir);
    try{
      assert.strictEqual((await request('/allowed.txt')).body, 'public');
      assert.strictEqual((await request('/internal.txt')).body, 'public');
      assert.strictEqual((await request('/escape.txt')).status, 404);
    }finally{
      servePaths.pop();
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('sends complete, escaped JSONP and ignores invalid callback names', async function(){
    routes.jsonp = {meta: {toJson: true}, func(req, cb){ cb(null, {text: 'hello'}); }};
    assert.strictEqual((await request('/jsonp?callback=app.done')).body, 'app.done({"text":"hello"});');
    assert.strictEqual((await request('/jsonp?callback=alert(1)')).body, '{"text":"hello"}');
    routes.jsonpText = {meta: {}, func(req, cb){ cb(null, 'a"b\\c'); }};
    assert.strictEqual((await request('/jsonpText?callback=done')).body, 'done(' + JSON.stringify('a"b\\c') + ');');
  });

  it('disables the callback timeout when getResponse is called before headers', async function(){
    let context;
    routes.raw = {meta: {}, func(req){
      context = req;
      const res = req.getResponse();
      setTimeout(() => res.end('manual'), 120);
    }};
    const result = await request('/raw');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, 'manual');
    assert.strictEqual(context.signal.aborted, false);
    assert.strictEqual(context.cleared, true);
  });

  it('does not log arguments of a late callback', async function(){
    const entries = [];
    const original = console.error;
    console.error = (...args) => entries.push(args);
    try{
      routes.late = {meta: {}, func(req, cb){ setTimeout(() => cb(null, 'sensitive-marker'), 120); }};
      const result = await request('/late');
      assert.strictEqual(result.status, 408);
      await sleep(160);
      assert.strictEqual(JSON.stringify(entries).includes('sensitive-marker'), false);
    }
    finally{ console.error = original; }
  });
  for(const mode of ['no callback', 'callback', 'prerun']){
    it(`keeps SSE and its services alive beyond the timeout with ${mode}`, async function(){
      let context;
      let servicesAvailable = false;
      const meta = mode === 'prerun' ? {prerun(req, meta, cb){ req.getResponse(); setTimeout(cb, 80); }} : {};
      routes.sse = {meta, func(req, cb){
        context = req;
        const services = {DAL: req.DAL, mail: req.mail, config: req.config, helpers: req.helpers};
        const res = req.getResponse();
        assert.strictEqual(req.getResponse(), res);
        res.writeHead(200, {'Content-Type': 'text/event-stream'});
        res.write('data: hello\n\n');
        if(mode === 'callback') cb();
        setTimeout(() => {
          servicesAvailable = !req.ended && !req.cleared && !req.signal.aborted &&
            Object.keys(services).every(key => req[key] === services[key]);
          res.end('data: done\n\n');
        }, 120);
      }};
      const result = await request('/sse');
      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.body, 'data: hello\n\ndata: done\n\n');
      assert.strictEqual(servicesAvailable, true);
      assert.strictEqual(context.signal.aborted, false);
      assert.strictEqual(context.ended, true);
      assert.strictEqual(context.cleared, true);
    });
  }

  it('keeps detached services usable after next and HTTP cleanup for a webhook', async function(){
    let context;
    let background;
    let locks;
    let finish;
    const completed = new Promise((resolve, reject) => { finish = {resolve, reject}; });
    routes.webhook = {meta: {}, func(req, cb){
      context = req;
      background = req.getBackgroundContext();
      locks = req.getProcessLocks();
      const release = background.lockBackground();
      cb(null, 'ok');
      setTimeout(async () => {
        try{
          assert.strictEqual(req.cleared, true);
          assert.strictEqual(req.DAL, undefined);
          assert.strictEqual(await background.DAL.events.save('event'), 'event:saved');
          assert.strictEqual(await background.mail.send(), 'sent');
          assert.strictEqual(typeof background.helpers.toJson, 'function');
          assert.strictEqual(background.config.timeout, 0.05);
          background.log.i('background completed');
          assert.strictEqual(req.getBackgroundContext().DAL, background.DAL);
          for(const key of ['end', 'error', 'getResponse', 'getRequest', 'signal', 'params', 'post']){
            assert.strictEqual(background[key], undefined);
          }
          finish.resolve();
        }catch(error){ finish.reject(error); }
        finally{ release(); }
      }, 120);
    }};
    const result = await request('/webhook');
    assert.strictEqual(result.body, 'ok');
    assert.strictEqual(Object.keys(locks).length, 1);
    await completed;
    assert.strictEqual(context.cleared, true);
    assert.strictEqual(Object.keys(locks).length, 0);
  });

  it('signals disconnect and prevents a late middleware from advancing', async function(){
    let context;
    let ran = false;
    routes.disconnect = {meta: {timeout: 1, prerun(req, meta, cb){
      context = req;
      setTimeout(cb, 100);
    }}, func(){ ran = true; }};
    const req = http.get({host: '127.0.0.1', port: server.address().port, path: '/disconnect'});
    req.on('error', () => {});
    await sleep(30);
    req.destroy();
    await sleep(150);
    assert.strictEqual(context.signal.reason, 'disconnect');
    assert.strictEqual(context.cleared, true);
    assert.strictEqual(ran, false);
  });

  it('signals an interrupted raw POST during asynchronous authorization', async function(){
    let context;
    let ran = false;
    routes.post = {meta: {skipParsePost: true, prerun(req, meta, cb){
      context = req;
      setTimeout(cb, 120);
    }}, func(){ ran = true; }};
    const req = http.request({host: '127.0.0.1', port: server.address().port, path: '/post', method: 'POST', headers: {'Content-Length': 100}});
    req.on('error', () => {});
    req.write('partial');
    await sleep(30);
    req.destroy();
    await sleep(170);
    assert.strictEqual(context.signal.reason, 'disconnect');
    assert.strictEqual(context.getRequest().aborted, true);
    assert.strictEqual(ran, false);
  });

  for(const lateError of [false, true]){
    it(`cleans up a disconnected static read with late ${lateError ? 'error' : 'success'} without imposing a module timeout`, async function(){
    const count = contexts.length;
    const req = http.get({host: '127.0.0.1', port: server.address().port, path: '/test_utils.js', headers: {'x-delay-static': '1'}});
    req.on('error', () => {});
    for(let i = 0; i < 50 && contexts.length === count; i++) await sleep(10);
    const context = contexts[count];
    assert(context && context.finishStatic);
    const locks = context.getProcessLocks();
    await sleep(100);
    assert.strictEqual(context.signal.aborted, false);
    assert.strictEqual(Object.keys(locks).length, 1);
    req.destroy();
    for(let i = 0; i < 50 && !context.cleared; i++) await sleep(10);
    assert.strictEqual(context.signal.reason, 'disconnect');
    assert.strictEqual(context.cleared, true);
    assert.strictEqual(Object.keys(locks).length, 0);
    if(lateError) context.finishStatic(new Error('late read error'));
    else context.finishStatic(null, Buffer.from('late'), {'Content-Type': 'text/plain'});
    });
  }

  it('parses a normal urlencoded POST with formidable', async function(){
    routes.form = {meta: {toJson: true}, func(req, cb){ cb(null, req.post); }};
    const result = await new Promise((resolve, reject) => {
      const req = http.request({host: '127.0.0.1', port: server.address().port, path: '/form', method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}}, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({status: res.statusCode, body}));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end('name=hello');
    });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(JSON.parse(result.body), {name: ['hello']});
  });

  it('cleans up an aborted POST while formidable is parsing', async function(){
    let ran = false;
    routes.formAbort = {meta: {}, func(){ ran = true; }};
    const count = contexts.length;
    const req = http.request({host: '127.0.0.1', port: server.address().port, path: '/formAbort', method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': 100}});
    req.on('error', () => {});
    req.write('name=partial');
    for(let i = 0; i < 50 && contexts.length === count; i++) await sleep(10);
    assert.strictEqual(contexts.length, count + 1);
    const context = contexts[count];
    const locks = context.getProcessLocks();
    req.destroy();
    for(let i = 0; i < 50 && !context.cleared; i++) await sleep(10);
    assert.strictEqual(context.signal.reason, 'disconnect');
    assert.strictEqual(context.cleared, true);
    assert.strictEqual(Object.keys(locks).length, 0);
    assert.strictEqual(ran, false);
  });

  it('holds shutdown until a timeout response finishes flushing', async function(){
    const { EventEmitter } = require('events');
    const { modifyRequestUtils, getProcessFunctionsUtils } = require('../../system/utils');
    const isolatedServer = rewire('../../system/server');
    const serverClass = isolatedServer.__get__('iServer');
    const locks = serverClass.processLocks;
    serverClass.instantShutdownDelay = 500;
    let exitCode;
    isolatedServer.__set__('process', {exit(code){ exitCode = code; }});
    const request = new EventEmitter();
    const response = new EventEmitter();
    response.writeHead = code => { response.statusCode = code; };
    response.end = () => { response.writableEnded = true; };
    const context = {id: 'flush', params: {}, headers: {}, cookies: {}, config: {}};
    const log = global.logger();
    modifyRequestUtils(context, request, response, getProcessFunctionsUtils(locks, {}), log);
    context._lifecycle.timeout();
    assert.strictEqual(response.statusCode, 408);
    assert.strictEqual(context.signal.reason, 'timeout');
    assert.strictEqual(Object.keys(locks).length, 1);
    assert.strictEqual(context.cleared, false);
    isolatedServer.graceful_shutdown(1);
    await sleep(80);
    assert.strictEqual(exitCode, undefined);
    response.writableFinished = true;
    response.emit('finish');
    assert.strictEqual(Object.keys(locks).length, 0);
    assert.strictEqual(context.cleared, true);
    await sleep(80);
    assert.strictEqual(exitCode, 1);
  });

  it('keeps background locks after normal response and releases them independently', async function(){
    let context;
    let locks;
    let release1;
    let release2;
    routes.background = {meta: {}, func(req, cb){
      context = req;
      locks = req.getProcessLocks();
      release1 = req.lockBackground();
      release2 = req.lockBackground();
      cb(null, {ok: true});
    }};
    assert.strictEqual((await request('/background')).status, 200);
    assert.strictEqual(context.signal.aborted, false);
    assert.strictEqual(Object.keys(locks).length, 2);
    release1(); release1();
    assert.strictEqual(Object.keys(locks).length, 1);
    release2();
    assert.strictEqual(Object.keys(locks).length, 0);
  });

  it('ignores repeated end and callback and preserves normal JSON', async function(){
    routes.repeat = {meta: {toJson: true}, func(req, cb){
      const end = req.end;
      cb(null, {ok: true});
      cb(null, {bad: true});
      end('again');
    }};
    const result = await request('/repeat');
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(JSON.parse(result.body), {ok: true});
  });

  it('does not release a renewed request lock from an older timer', async function(){
    let locks;
    routes.renew = {meta: {timeout: 1}, func(req){
      locks = req.getProcessLocks();
      req.lockShutdown(40);
      setTimeout(() => req.lockShutdown(150), 20);
      setTimeout(() => req.end('done'), 100);
    }};
    const pending = request('/renew');
    await sleep(70);
    assert.strictEqual(Object.keys(locks).length, 1);
    await pending;
    assert.strictEqual(Object.keys(locks).length, 0);
  });

});
