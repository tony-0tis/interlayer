const assert = require('assert');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort(){
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  return port;
}

function waitForMessage(child, type, exited, getOutput){
  let timer;
  let listener;
  const message = new Promise((resolve, reject) => {
    listener = value => { if(value && value.type === type) resolve(value); };
    child.on('message', listener);
    timer = setTimeout(() => reject(new Error('timed out waiting for ' + type + ': ' + getOutput())), 5000);
  });
  return Promise.race([
    message,
    exited.then(result => { throw new Error('child exited waiting for ' + type + ': ' + JSON.stringify(result) + '\n' + getOutput()); })
  ]).finally(() => {
    clearTimeout(timer);
    child.removeListener('message', listener);
  });
}

function openSse(port){
  return new Promise((resolve, reject) => {
    const req = http.get({host: '127.0.0.1', port, path: '/tasks/sse'}, res => {
      res.once('data', chunk => resolve({req, res, chunk: chunk.toString()}));
      res.once('error', reject);
      res.once('end', () => reject(new Error('SSE ended before its first event')));
    });
    req.setTimeout(2000, () => req.destroy(new Error('SSE request timed out')));
    req.once('error', reject);
  });
}

async function connect(port, child, getOutput){
  const deadline = Date.now() + 20000;
  while(Date.now() < deadline){
    if(child.exitCode !== null || child.signalCode !== null){
      throw new Error('server exited before startup: ' + getOutput());
    }
    try{ return await openSse(port); }
    catch(err){
      if(err.code !== 'ECONNREFUSED') throw err;
      await sleep(50);
    }
  }
  throw new Error('server did not start within 20 seconds: ' + getOutput());
}

describe('background work after HTTP disconnect', function(){
  this.timeout(30000);

  it('keeps the background lock through cleanup and waits for its release on shutdown', async function(){
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(__dirname, '../fixtures/lifecycle/server.cjs')], {
      cwd: path.join(__dirname, '../..'),
      env: {...process.env, TEST_PORT: String(port), TEST_WORKERS: '1', TEST_DELAY: '10000', TEST_START_DELAY: '0'},
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => output += chunk);
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({code, signal}));
    });
    let stream;
    try{
      stream = await connect(port, child, () => output);
      assert.strictEqual(stream.res.statusCode, 200, output);
      assert.match(stream.res.headers['content-type'], /^text\/event-stream/);
      assert.strictEqual(stream.chunk, 'data: started\n\n');
      const disconnected = waitForMessage(child, 'disconnected', exited, () => output);
      stream.req.destroy();
      assert.deepStrictEqual(await disconnected, {type: 'disconnected', reason: 'disconnect', cleared: true, locks: 1});

      child.kill('SIGTERM');
      await sleep(200);
      assert.strictEqual(child.exitCode, null, 'shutdown did not wait for background work: ' + output);
      assert.strictEqual(child.signalCode, null, output);
      const inspected = waitForMessage(child, 'inspected', exited, () => output);
      child.send({type: 'inspect'});
      assert.deepStrictEqual(await inspected, {type: 'inspected', cleared: true, locks: 1, shutdown: true});
      const finished = waitForMessage(child, 'finished', exited, () => output);
      child.send({type: 'finish'});
      assert.deepStrictEqual(await finished, {type: 'finished', locks: 0});
      let timer;
      try{
        const result = await Promise.race([
          exited,
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('shutdown hung: ' + output)), 5000); })
        ]);
        assert.deepStrictEqual(result, {code: 0, signal: null}, output);
      }
      finally{ clearTimeout(timer); }
    }
    finally{
      if(stream) stream.req.destroy();
      if(child.exitCode === null && child.signalCode === null){
        child.kill('SIGKILL');
        await exited;
      }
    }
  });
});
