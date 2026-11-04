const assert=require('assert');
const {EventEmitter}=require('events');
const rewire=require('rewire');
const sinon=require('sinon');
const {log}=require('../support');
require('../init');

describe('database adapters',function(){
  it('validates MySQL configuration and delegates pool options',function(){
    const mysql=rewire('../../system/DAL/mysql'); let options;
    mysql.methods.query('SELECT 1',err=>assert.strictEqual(err,'NO_CONNECTION'));
    mysql.__set__('createPool',config=>{options=config;return {config};});
    assert.throws(()=>mysql.init({},{}),/database/);
    mysql.init({},{database:'app',port:3307});
    assert.deepStrictEqual(options,{host:'127.0.0.1',user:'root',database:'app',port:3307});
    assert.strictEqual(mysql.methods.escape("a'b"),"'a\\'b'");
    assert.strictEqual(mysql.methods.escapeId('table'),'`table`');
    assert.strictEqual(mysql.methods.format('SELECT ?', [3]),'SELECT 3');
  });
  it('releases MySQL connections on success, query failure and callbackless queries',function(){
    const mysql=rewire('../../system/DAL/mysql');let released=0,queries=0;
    const connection={release(){released++;},query(...args){queries++; args.at(-1)(null,[{id:1}]);return {sql:'SELECT 1'};}};
    mysql.__set__('DAL',{getConnection:cb=>cb(null,connection)});
    mysql.methods.query.call({showSql:true},'SELECT 1',(err,rows)=>{assert.ifError(err);assert.strictEqual(rows[0].id,1);});
    mysql.methods.query('SELECT 1');
    assert.strictEqual(queries,2);assert.strictEqual(released,2);
    connection.query=()=>{throw new Error('bad SQL');};
    mysql.methods.query('bad',err=>assert.match(err.message,/bad SQL/));
    assert.strictEqual(released,3);
    mysql.__set__('DAL',{getConnection:cb=>cb(new Error('pool unavailable'))});
    mysql.methods.query('SELECT 1',err=>assert.match(err.message,/pool unavailable/));
  });
  it('initializes PostgreSQL and forwards query, connect, end and pool errors',async function(){
    const postgres=rewire('../../system/DAL/postgres'); postgres.methods.connect(err=>assert.strictEqual(err,'NO_CONNECTION')); const pool=new EventEmitter();let options;
    pool.query=async sql=>({rows:[sql]});pool.connect=async()=> 'client';pool.end=async()=> 'ended';
    postgres.__set__({pg:{Pool:function(config){options=config;return pool;}},log:log()});
    assert.throws(()=>postgres.init({},{}),/database/);
    postgres.init({},{database:'app'}); assert.strictEqual(options.database,'app');
    pool.emit('error',new Error('idle'));
    assert.deepStrictEqual(await postgres.methods.query('SELECT 1'),{rows:['SELECT 1']});
    assert.strictEqual(await postgres.methods.connect(),'client');assert.strictEqual(await postgres.methods.end(),'ended');
  });

  function redisFixture(){
    const redis=rewire('../../system/DAL/redis'); const clients=[];let configurations=[];
    redis.__set__({log:log(),createClient:config=>{
      configurations.push(config); const client=new EventEmitter();client.quit=()=>{client.closed=true;return Promise.resolve();};
      client.connect=()=>{setImmediate(()=>client.emit('ready'));return Promise.resolve();};
      client.GET=(key,cb)=>setImmediate(()=>cb(null,'value:'+key));
      client.SET=(key,value,cb)=>setImmediate(()=>cb(null,'OK'));
      client.get=client.GET;client.set=client.SET;
      clients.push(client);return client;
    }});
    return {redis,clients,configurations,dal:redis.__get__('DAL')};
  }
  it('creates and reuses Redis connections for uppercase/lowercase commands',async function(){
    const {redis,clients,dal,configurations}=redisFixture();redis.init({},{socket:{port:6380}});
    const get=key=>new Promise((resolve,reject)=>redis.methods.get(key,(err,res)=>err?reject(err):resolve(res)));
    assert.strictEqual(await get('a'),'value:a');assert.strictEqual(await get('b'),'value:b');
    assert.strictEqual(clients.length,1);assert.strictEqual(dal.opened.length,0);assert.strictEqual(dal.connections.length,1);
    assert.strictEqual(configurations[0].legacyMode,true);assert.strictEqual(configurations[0].socket.port,6380);
    await new Promise(resolve=>redis.methods.GET('c',(err,result)=>{assert.ifError(err);assert.strictEqual(result,'value:c');resolve();}));
    clients[0].emit('end'); assert.strictEqual(dal.connections.length,0);
  });
  it('propagates Redis connection errors once and removes broken connections',async function(){
    const {redis,clients,dal}=redisFixture();let calls=0;
    const result=new Promise(resolve=>redis.methods.get('key',err=>{calls++;resolve(err);}));
    const err=new Error('connect failed');clients[0].emit('error',err);
    assert.strictEqual(await result,err);await new Promise(resolve=>setImmediate(resolve));
    clients[0].emit('error',err);clients[0].emit('end');assert.strictEqual(calls,1);
    assert.strictEqual(dal.opened.length,0);assert.strictEqual(dal.connections.length,0);
  });
  it('executes deferred Redis chains without releasing a busy connection',async function(){
    const {redis,dal}=redisFixture();let lazy;
    const result=new Promise((resolve,reject)=>{
      lazy=redis.methods.set('key','value',(err,res)=>{if(err)reject(err);else assert.strictEqual(res,'OK');});
      lazy.get('key',(err,res)=>err?reject(err):resolve(res));
    });
    assert.strictEqual(await result,'value:key');
    await new Promise(resolve=>setImmediate(resolve));
    assert.strictEqual(dal.opened.length,0);assert.strictEqual(dal.connections.length,1);
  });
  it('handles Redis command exceptions, rejected connect promises and post-ready errors',async function(){
    const first=redisFixture();const done=new Promise(resolve=>first.redis.methods.get('key',err=>{assert.match(err.message,/bad command/);resolve();}));
    first.clients[0].get=()=>{throw Error('bad command');};await done;assert.strictEqual(first.dal.connections.length,1);
    first.configurations[0].emit_error(Error('lost connection'));assert.strictEqual(first.dal.connections.length,0);
    first.clients[0].emit('requestEnded');
    const third=redisFixture();await new Promise(resolve=>third.redis.methods.get('x',()=>resolve()));third.dal.connections=[];third.clients[0].emit('requestEnded');
    const second=redisFixture();second.redis.__set__('createClient',()=>{const client=new EventEmitter();client.quit=async()=>{};client.connect=async()=>{throw Error('connect rejected');};return client;});
    await new Promise(resolve=>second.redis.methods.get('key',err=>{assert.match(err.message,/connect rejected/);resolve();}));
  });
  it('does not leak rejected close promises or recurse on Redis disconnect errors',async function(){
    for(const sync of [false,true]){
      const {redis,clients,dal}=redisFixture();const ended=new Promise(resolve=>redis.methods.get('x',err=>{assert.match(err.message,/connect failed/);resolve();}));
      clients[0].disconnect=()=>{if(sync)throw Error('already closed');return Promise.reject(Error('already closed'));};
      clients[0].emit('error',Error('connect failed'));await ended;await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(dal.opened.length,0);
    }
  });

  it('releases MySQL once, ignores repeated driver callbacks and preserves user exceptions',function(){
    const mysql=rewire('../../system/DAL/mysql');let released=0,calls=0;
    mysql.__set__('DAL',{getConnection:cb=>cb(null,{release(){released++;},query(sql,done){done(null,'ok');done(Error('late'));}})});
    mysql.methods.query('SELECT 1',(err,result)=>{calls++;assert.ifError(err);assert.strictEqual(result,'ok');});assert.strictEqual(released,1);assert.strictEqual(calls,1);
    const userError=Error('user callback');assert.throws(()=>mysql.methods.query('SELECT 1',()=>{throw userError;}),err=>err===userError);assert.strictEqual(released,2);
    const failure=Error('getConnection threw');mysql.__set__('DAL',{getConnection(){throw failure;}});mysql.methods.query('SELECT 1',err=>assert.strictEqual(err,failure));
  });
  it('forwards PostgreSQL rejected query/connect promises and callback errors',async function(){
    const pg=rewire('../../system/DAL/postgres');const failure=Error('database unavailable');
    pg.__set__('DAL',{query:(sql,cb)=>typeof cb==='function'?cb(failure):Promise.reject(failure),connect:()=>Promise.reject(failure),end:()=>Promise.reject(failure)});
    await assert.rejects(pg.methods.query('SELECT 1'),err=>err===failure);await assert.rejects(pg.methods.connect(),err=>err===failure);await assert.rejects(pg.methods.end(),err=>err===failure);
    let count=0;pg.methods.query('SELECT 1',err=>{count++;assert.strictEqual(err,failure);});assert.strictEqual(count,1);
  });
  for(const mode of ['constructor','connect throws','connect rejects']){
    it(`notifies every queued Redis callback when ${mode}`,async function(){
      const {redis,dal}=redisFixture();const failure=Error(mode);const received=[];
      redis.__set__('createClient',()=>{
        if(mode==='constructor')throw failure;
        const client=new EventEmitter();client.quit=()=>{};client.connect=()=>{if(mode==='connect throws')throw failure;return Promise.reject(failure);};return client;
      });
      await new Promise(resolve=>{
        const collect=err=>{received.push(err);if(received.length===2)resolve();};
        redis.methods.set('key','value',collect).get('key',collect);
      });
      assert.deepStrictEqual(received,[failure,failure]);assert.strictEqual(dal.opened.length,0);assert.strictEqual(dal.connections.length,0);
    });
  }
  for(const event of ['error','end']){
    it(`fails an in-flight Redis command and its queue on ${event}, ignoring late command callbacks`,async function(){
      const {redis,clients,dal}=redisFixture();const errors=[];let late;
      const complete=new Promise(resolve=>{
        const collect=err=>{errors.push(err);if(errors.length===2)resolve();};redis.methods.set('key','value',collect).get('key',collect);
      });
      clients[0].set=(key,value,cb)=>{late=cb;};clients[0].get=()=>assert.fail('queued command must not run');
      await new Promise(resolve=>clients[0].once('ready',resolve));
      clients[0].emit(event,event==='error'?Error('connection lost'):undefined);await complete;
      assert(errors.every(err=>err instanceof Error));late(null,'late success');late(Error('late failure'));assert.strictEqual(errors.length,2);
      assert.strictEqual(dal.opened.length,0);assert.strictEqual(dal.connections.length,0);
    });
  }
  it('does not repeat callbacks or execute the Redis queue after a command error',async function(){
    const {redis,clients,dal}=redisFixture();const failure=Error('WRONGTYPE');const errors=[];
    const complete=new Promise(resolve=>{const collect=err=>{errors.push(err);if(errors.length===2)resolve();};redis.methods.set('key','value',collect).get('key',collect);});
    clients[0].set=(key,value,cb)=>{cb(failure);cb(null,'late');};clients[0].get=()=>assert.fail('queue must stop');await complete;
    assert.deepStrictEqual(errors,[failure,failure]);assert.strictEqual(dal.connections.length,1);
  });
  it('supports callbackless Redis commands and does not leak operation event listeners',async function(){
    const {redis,clients,dal}=redisFixture();redis.methods.get('key');await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
    assert.strictEqual(dal.connections.length,1);assert.strictEqual(clients[0].listenerCount('error'),1);assert.strictEqual(clients[0].listenerCount('end'),1);
    const second=redisFixture();second.redis.methods.get('key');second.clients[0].emit('error',Error('failed without callback'));await new Promise(resolve=>setImmediate(resolve));
  });
  it('expires Redis clients safely when close rejects, throws, or emits end synchronously',async function(){
    const {dal}=redisFixture();let closed=0;const expired=Date.now()-14400001;
    dal.connections=[
      {id:'a',lastOpened:expired,redis:{disconnect(){closed++;dal._closeConnection('a');return Promise.reject(Error('closed'));}}},
      {id:'b',lastOpened:expired,redis:{quit(){closed++;throw Error('closed');}}}
    ];dal._checkConnections();await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(closed,2);assert.deepStrictEqual(dal.connections,[]);
  });
  it('expires idle Redis connections and applies retry decisions',function(){
    const {redis,dal}=redisFixture();const clock={restore(){}};
    try{
      let closed=0;dal.opened=[{id:'old',lastOpened:Date.now()-14400001,redis:{quit(){closed++;}}},{id:'fresh',lastOpened:Date.now(),redis:{}}];
      dal.connections=[{id:'idle',lastOpened:Date.now()-14400001,redis:{quit(){closed++;}}}];dal._checkConnections();
      assert.strictEqual(closed,2);assert.strictEqual(dal.opened.length,1);assert.strictEqual(dal._closeConnection('absent'),undefined);
      assert.strictEqual(dal._closeConnection('fresh').length,1);
      const retry=redis.__get__('retry_strategy');let error;
      const ctx={emit_error:value=>error=value};
      assert(retry.call(ctx,{error:{code:'ECONNREFUSED'}}) instanceof Error);assert.strictEqual(error,'No connection');
      assert(retry.call(ctx,{total_retry_time:3600001}) instanceof Error);
      assert.strictEqual(retry.call(ctx,{times_connected:11}),undefined);
      assert.strictEqual(retry({attempt:1}),3000);assert.strictEqual(retry({attempt:40}),4000);
    }finally{clock.restore();}
  });
});

describe('mail adapters',function(){
  it('passes Mailgun configuration and preserves callback results',function(){
    const mailgun=rewire('../../system/mail/mailgun');let options,email;
    mailgun.__set__('mailgun',config=>{options=config;return {messages:()=>({send:(message,cb)=>{email=message;cb(null,'sent');}})};});
    mailgun.init({},{apiKey:'test'});mailgun.send({to:'user@example.com'},(err,res)=>{assert.ifError(err);assert.strictEqual(res,'sent');});
    assert.deepStrictEqual(options,{apiKey:'test'});assert.strictEqual(email.to,'user@example.com');
  });
  it('builds SparkPost transmissions and reports provider rejection',async function(){
    const sparkpost=rewire('../../system/mail/sparkpost');let apiKey,payload;
    sparkpost.__set__('SparkPost',function(key){apiKey=key;return {transmissions:{send:async message=>{payload=message;return 'sent';}}};});
    sparkpost.init({},{apiKey:'secret'});
    await new Promise((resolve,reject)=>sparkpost.send({from:'a',to:'b',subject:'s',text:'text'},(err,result)=>err?reject(err):(assert.strictEqual(result,'sent'),resolve())));
    assert.strictEqual(apiKey,'secret');assert.deepStrictEqual(payload.recipients,[{address:'b'}]);assert.strictEqual(payload.content.html,undefined);
    const failure=new Error('rejected');sparkpost.client.transmissions.send=async()=>{throw failure;};
    await new Promise(resolve=>sparkpost.send({html:'<p>hello</p>'},err=>{assert.strictEqual(err,failure);resolve();}));
  });
  it('initializes SMTP and sends using the real offline JSON transport',async function(){
    const smtp=rewire('../../system/mail/smtp');smtp.init({},{jsonTransport:true});
    const info=await smtp.send({from:'a@example.com',to:'b@example.com',text:'test'});
    assert.strictEqual(JSON.parse(info.message).text,'test');
  });
  it('reports synchronous SMTP/SparkPost provider errors and never repeats a throwing callback',async function(){
    const failure=Error('provider threw');const userError=Error('callback threw');
    for(const name of ['smtp','sparkpost']){
      const sender=rewire('../../system/mail/'+name);
      if(name==='smtp')sender.transporter={sendMail(){throw failure;}};
      else sender.client={transmissions:{send(){throw failure;}}};
      await assert.rejects(sender.send({}),err=>err===failure);let calls=0;
      await sender.send({},err=>{calls++;assert.strictEqual(err,failure);});assert.strictEqual(calls,1);
      if(name==='smtp')sender.transporter.sendMail=async()=> 'sent';else sender.client.transmissions.send=async()=> 'sent';
      calls=0;await assert.rejects(sender.send({},()=>{calls++;throw userError;}),err=>err===userError);assert.strictEqual(calls,1);
    }
  });
  it('preserves Mailgun callback errors',function(){
    const sender=rewire('../../system/mail/mailgun');const failure=Error('rejected');sender.client={messages:()=>({send:(email,cb)=>cb(failure)})};
    sender.send({},err=>assert.strictEqual(err,failure));
  });

});
