const assert = require('assert');
const rewire = require('rewire');
const {sandbox, log} = require('../support');
require('../init');

describe('module and middleware discovery', function(){
  let files, loader, errors;
  beforeEach(function(){files=sandbox(); loader=rewire('../../system/inits'); errors=[];});
  afterEach(function(){files.close();});
  const logger = errors => ({...log(),e(...args){errors.push(args);}});

  it('discovers plain, builder and directory modules and their aliases', function(){
    files.write('modules/plain.js', `exports.__meta={alias:'alias',find(req,cb){cb(null,'found')}}; exports._run={alias:'other'}; exports.run=(req,cb)=>cb(null,'ok'); exports.__init=()=>{};`);
    files.write('modules/builder.js', `exports.__moduleInfo={_call:{path:'custom'},call(){}};`);
    files.write('modules/dir/index.js', `exports.__meta={alias:'dirAlias',default(){}};`);
    files.write('modules/html.js', `exports.__meta={alias:'htmlAlias',html(){}};`);
    const result=loader.__get__('initModules')({modules:[files.root+'/modules']},logger(errors));
    assert.strictEqual(result.modules['plain/run'],result.modules['plain/other']);
    assert.strictEqual(result.modules['plain/*'],result.modules['alias/*']);
    assert.strictEqual(typeof result.modules['builder/custom'].func,'function');
    assert.strictEqual(typeof result.modules.dir.func,'function');
    assert.strictEqual(typeof result.modules.html.func,'function');
    assert.strictEqual(typeof result.inits['plain.js'],'function');
    assert.strictEqual(result.info.length,2);
    assert.strictEqual(errors.length,0);
  });

  for(const scope of ['prefixed','module','globalMeta','methodMeta']){
    it(`registers custom paths and distinct aliases for ${scope} routes`,function(){
      const root=scope!=='prefixed';
      files.write('modules/example.js', `
        exports.addToRoot=${scope==='module'};
        exports.__meta={addToRoot:${scope==='globalMeta'}};
        exports._run={path:'custom/path',alias:'legacy'${scope==='methodMeta'?',addToRoot:true':''}};
        exports.run=(req,cb)=>cb(null,'ok');
      `);
      const result=loader.__get__('initModules')({modules:[files.root+'/modules']},logger(errors));
      const path=root?'custom/path':'example/custom/path';
      const alias=root?'legacy':'example/legacy';
      assert.strictEqual(typeof result.modules[path].func,'function');
      assert.strictEqual(result.modules[alias],result.modules[path]);
      assert.strictEqual(result.modules[root?'run':'example/run'],undefined);
      assert.strictEqual(result.info[0].methods[0].url,path);
      assert.strictEqual(result.info[0].methods[0].alias,alias);
      assert.strictEqual(errors.length,0);
    });
  }
  it('ignores hidden/non-JS files and directories without index and isolates broken modules', function(){
    files.write('modules/.hidden.js', `throw Error('hidden must not load')`);
    files.write('modules/nested/note.txt','skip');
    files.write('modules/readme.txt','skip');
    files.write('modules/duplicate.js', `exports.addToRoot=true; exports._ok={}; exports.ok=()=>{};`);
    files.write('modules/broken.js', `throw Error('bad module')`);
    files.write('modules/good.js', `exports._missing={}; exports._ok={alias:'ok'}; exports.ok=()=>{}; exports._again={path:'ok'}; exports.again=()=>{};`);
    const result=loader.__get__('initModules')({modules:[files.root+'/modules']},logger(errors));
    assert.strictEqual(typeof result.modules['good/ok'].func,'function');
    assert.strictEqual(errors.length,4); // broken module, missing method, duplicate alias and method URL
  });

  it('loads translations and skips invalid JSON, directories and unsupported extensions', function(){
    files.write('i18n/en.json','{"hello":"Hello"}');
    files.write('i18n/.hidden.json','{}');files.write('i18n/bad.json','{'); files.write('i18n/note.txt','text'); files.write('i18n/sub/a.json','{}');
    const result=loader.__get__('initI18n')({i18n:[files.root+'/i18n']},logger(errors));
    assert.deepStrictEqual(result,{en:{hello:'Hello'}}); assert.strictEqual(errors.length,1);
    assert.strictEqual(loader.__get__('initServe')({},log()),null);
    assert.deepStrictEqual(loader.__get__('initServe')({serve:['public']},log()),['public']);
  });

  it('supports wildcard, array, function and named middleware triggers with explicit order', function(){
    files.write('middleware/a.js',`exports.run=()=>{}; exports.__init=()=>{};`);
    files.write('middleware/b.js',`exports.triggers=['meta.auth']; exports.run=()=>{};`);
    files.write('middleware/c.js',`exports.triggers={'request.path':'run','meta.foo':()=>{},bad:'missing',invalid:'number'}; exports.run=()=>{}; exports.number=3;`);
    files.write('middleware/d.js',`exports.triggers=['meta.auth'];`);
    files.write('middleware/e.js',`exports.noop=()=>{};`);
    files.write('middleware/broken.js',`throw Error('bad middleware')`);
    files.write('middleware/.hidden.js',`throw Error('hidden')`);
    files.write('middleware/sub/note','ignored');
    const result=loader.__get__('initMiddlewares')({middleware:[files.root+'/middleware'],middlewareOrder:['c','absent','a']},logger(errors));
    assert.deepStrictEqual(result.middlewares.map(m=>m.name),['c','b','a']);
    assert.strictEqual(typeof result.inits['a.js'],'function');
    assert.strictEqual(typeof result.middlewares[0].triggers['request.path'],'function');
    assert.strictEqual(typeof result.middlewares[2].triggers['*'],'function');
    assert.strictEqual(errors.length,6);
  });

  it('loads custom DALs and senders with user paths taking precedence and freezes registries', function(){
    files.write('services/custom.js',`exports.methods={query:()=>42}; exports.init=(config,options)=>{if(!options.allowed) throw Error('bad');}; exports.send=()=>43;`);
    files.write('services/bad.js',`exports.init=()=>{};`);
    files.write('services/noinit.js',`exports.methods={}; exports.send=()=>{};`);
    const config={dals:[files.root+'/services'],emailSenders:[files.root+'/services'],useDals:{custom:{allowed:true},bad:{},absent:{}},useEmailSenders:{custom:{allowed:true},bad:{},noinit:{},absent:{}}};
    const dal=rewire('../../system/DAL'); const mail=rewire('../../system/mail');
    dal.__set__('log',logger(errors)); mail.__set__('log',logger(errors));
    const dals=dal.init(config,config); const senders=mail.init(config);
    assert.strictEqual(dals.custom.query(),42); assert.strictEqual(senders.custom(),43);
    assert(Object.isFrozen(dals)); assert(Object.isFrozen(dals.custom)); assert(Object.isFrozen(senders));
    assert.strictEqual(dal.init({},{}),undefined); assert.strictEqual(mail.init({}),undefined); assert.strictEqual(mail.init({useEmailSenders:{}}),undefined);
    assert(errors.length>=3);
  });

  it('initializes a complete application config with no optional services',function(){
    const result=loader.init({modules:[],middleware:[],i18n:[],serve:[],useDals:{},useEmailSenders:{}});
    assert.deepStrictEqual(result.modules.modules,{}); assert.deepStrictEqual(result.middlewares.middlewares,[]);
    assert.deepStrictEqual(result.i18n,{}); assert.strictEqual(result.serve,null);
  });
  it('ignores inherited middleware order entries',function(){
    files.write('middleware/a.js',`exports.run=()=>{};`);files.write('middleware/b.js',`exports.run=()=>{};`);
    const order=['b'];Object.setPrototypeOf(order,Object.assign(Object.create(Array.prototype),{inherited:'a'}));
    const result=loader.__get__('initMiddlewares')({middleware:[files.root+'/middleware'],middlewareOrder:order},logger(errors));
    assert.deepStrictEqual(result.middlewares.map(item=>item.name),['b','a']);assert.strictEqual(errors.length,0);
  });

  it('rejects invalid middleware trigger types and nonfunction run handlers',function(){
    files.write('middleware/bad-type.js',`exports.triggers='meta.auth';exports.run=()=>{};`);
    files.write('middleware/bad-run.js',`exports.run=42;`);
    files.write('middleware/bad-array-run.js',`exports.triggers=['meta.auth'];exports.run='not a function';`);
    files.write('middleware/good.js',`exports.run=()=>{};`);
    const result=loader.__get__('initMiddlewares')({middleware:[files.root+'/middleware']},logger(errors));
    assert.deepStrictEqual(result.middlewares.map(item=>item.name),['good']);assert.strictEqual(errors.length,3);
  });

});
