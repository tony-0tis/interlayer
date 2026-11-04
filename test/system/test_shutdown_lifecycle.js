const assert = require('assert');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForExit(exited){
  let timer;
  try{
    return await Promise.race([exited, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('shutdown hung')), 2500);
    })]);
  }
  finally{ clearTimeout(timer); }
}

async function freePort(){
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function cleanupChild(child, exited){
  if(process.platform !== 'win32' && child.pid){
    try{ process.kill(-child.pid, 'SIGKILL'); }
    catch(err){ if(err.code !== 'ESRCH') throw err; }
  }
  else if(child.exitCode === null && child.signalCode === null){
    child.kill('SIGKILL');
  }
  await exited;
}

function request(port, mode){
  return new Promise((resolve, reject) => {
    const req = http.get({host: '127.0.0.1', port, path: '/tasks/run?mode=' + mode}, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
      res.on('error', reject);
    });
    req.setTimeout(2000, () => req.destroy(new Error('startup request timed out')));
    req.on('error', reject);
  });
}

async function waitForStart(port, mode, child, getOutput){
  const deadline = Date.now() + 20000;
  while(Date.now() < deadline){
    if(child.exitCode !== null || child.signalCode !== null){
      throw new Error('server exited before startup: ' + getOutput());
    }
    try{
      const status = await request(port, mode);
      assert.strictEqual(status, 200, 'unexpected startup response: ' + getOutput());
      return;
    }
    catch(err){
      if(err.code !== 'ECONNREFUSED') throw err;
      await sleep(50);
    }
  }
  throw new Error('server did not start within 20 seconds: ' + getOutput());
}

describe('graceful shutdown integration', function(){
  this.timeout(30000);
  for(const workers of [1, 2]){
    it(`preserves SIGINT exit status with ${workers} worker(s)`, async function(){
      const port = await freePort();
      const child = spawn(process.execPath, [path.join(__dirname, '../fixtures/lifecycle/server.cjs')], {
        cwd: path.join(__dirname, '../..'),
        env: {...process.env, TEST_PORT: String(port), TEST_WORKERS: String(workers), TEST_DELAY: '700', TEST_START_DELAY: workers === 2 ? '3500' : '0'},
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', chunk => output += chunk);
      child.stderr.on('data', chunk => output += chunk);
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({code, signal}));
      });
      try{
        await waitForStart(port, 'finish', child, () => output);
        child.kill('SIGINT');
        const result = await waitForExit(exited);
        assert.deepStrictEqual(result, {code: 1, signal: null}, output);
      }
      finally{
        await cleanupChild(child, exited);
      }
    });
    for(const mode of ['finish', 'hang']){
      it(`waits for ${mode} background work with ${workers} worker(s)`, async function(){
        const port = await freePort();
        const child = spawn(process.execPath, [path.join(__dirname, '../fixtures/lifecycle/server.cjs')], {
          cwd: path.join(__dirname, '../..'),
          env: {...process.env, TEST_PORT: String(port), TEST_WORKERS: String(workers), TEST_DELAY: '700', TEST_START_DELAY: '0'},
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        child.stdout.on('data', chunk => output += chunk);
        child.stderr.on('data', chunk => output += chunk);
        const exited = new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code, signal) => resolve({code, signal}));
        });
        try{
          await waitForStart(port, mode, child, () => output);
          const start = Date.now();
          child.kill('SIGTERM');
          const result = await waitForExit(exited);
          const elapsed = Date.now() - start;
          assert.strictEqual(result.signal, null, output);
          assert(elapsed >= (mode === 'finish' ? 200 : 600), `shutdown too early: ${elapsed}ms\n${output}`);
          assert(elapsed < 2000, `shutdown too late: ${elapsed}ms\n${output}`);
          assert.strictEqual(output.includes('BACKGROUND_DONE'), mode === 'finish', output);
        }
        finally{
          await cleanupChild(child, exited);
        }
      });
    }
  }
});
