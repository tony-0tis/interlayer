const assert = require('assert');
const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = require('fs');
const {join} = require('path');
const {tmpdir} = require('os');
const rewire = require('rewire');
require('../init');
const {getProcessFunctionsUtils} = require('../../system/utils');

describe('review regressions', function(){
  it('loads views from the first existing directory, asynchronously and synchronously', async function(){
    const root = mkdtempSync(join(tmpdir(), 'interlayer-views-'));
    try{
      const first = join(root, 'first');
      const second = join(root, 'second');
      mkdirSync(first); mkdirSync(second);
      writeFileSync(join(second, 'view.html'), 'hello');
      const context = Object.assign({config: {views: [first, second]}}, getProcessFunctionsUtils({}, {}));
      assert.strictEqual(context.getViewSync('view.html'), 'hello');
      const result = await new Promise((resolve, reject) => context.getView('view.html', (err, data, headers) => err ? reject(err) : resolve({data, headers})));
      assert.strictEqual(result.data, 'hello');
      assert.strictEqual(result.headers['Content-Type'], 'text/html');
      writeFileSync(join(first, 'view.html'), 'first');
      assert.strictEqual(await new Promise((resolve, reject) => context.getView('view.html', (err, data) => err ? reject(err) : resolve(data))), 'first');
    }finally{ rmSync(root, {recursive: true, force: true}); }
  });

  it('applies upload limits through the public builder', function(){
    const server = require('../../index').server();
    assert.strictEqual(server.setFormidableOptions({maxFiles: 1}), server);
    assert.strictEqual(server.getConfig().formidableOptions.maxFiles, 1);
    assert(server.setFormidableOptions(null) instanceof Error);
  });

  it('forwards PostgreSQL queries with both callbacks and promises', async function(){
    const postgres = rewire('../../system/DAL/postgres');
    const calls = [];
    postgres.__set__('DAL', {query(sql, cb){
      calls.push(sql);
      const result = {rows: [{id: 1}]};
      if(cb) return cb(null, result);
      return Promise.resolve(result);
    }});
    assert.deepStrictEqual((await postgres.methods.query('SELECT 1')).rows, [{id: 1}]);
    await new Promise((resolve, reject) => postgres.methods.query('SELECT 2', (err, result) => {
      if(err) return reject(err);
      assert.deepStrictEqual(result.rows, [{id: 1}]); resolve();
    }));
    assert.deepStrictEqual(calls, ['SELECT 1', 'SELECT 2']);
  });
  it('keeps scheduled tasks when deleting an unknown or already deleted key', function(){
    require('../../index');
    const intervals = global.intervals;
    const first = intervals.add(() => {}, 10);
    const second = intervals.add(() => {}, 20);
    try{
      intervals.del('unknown');
      assert(intervals._funcs.some(task => task.key === first));
      assert(intervals._funcs.some(task => task.key === second));
      intervals.del(first);
      intervals.del(first);
      assert(intervals._funcs.some(task => task.key === second));
    }finally{ intervals.del(first); intervals.del(second); }
  });

  it('forwards SMTP success and failure to callbacks and promise callers', async function(){
    const previousCreate = global.logger.create;
    global.logger.create = global.logger;
    let smtp;
    try{ smtp = rewire('../../system/mail/smtp'); }
    finally{ global.logger.create = previousCreate; }
    const info = {messageId: 'test'};
    const failure = new Error('SMTP rejected');
    smtp.transporter = {sendMail: async () => info};
    assert.strictEqual(await smtp.send({}), info);
    await new Promise((resolve, reject) => smtp.send({}, (err, result) => {
      if(err) return reject(err);
      assert.strictEqual(result, info); resolve();
    }));
    smtp.transporter = {sendMail: async () => { throw failure; }};
    await assert.rejects(smtp.send({}), err => err === failure);
    let calls = 0;
    await smtp.send({}, err => { calls++; assert.strictEqual(err, failure); });
    assert.strictEqual(calls, 1);
  });

});
