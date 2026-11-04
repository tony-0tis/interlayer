exports._run = {};
exports.run = (req, cb) => {
  const release = req.lockBackground();
  if(req.params.mode !== 'hang'){
    setTimeout(() => {
      console.log('BACKGROUND_DONE');
      release();
    }, 350);
  }
  cb(null, 'started');
};

exports._sse = {};
exports.sse = req => {
  const locks = req.getProcessLocks();
  const release = req.lockBackground();
  const signal = req.signal;
  signal.addEventListener('abort', () => {
    setImmediate(() => process.send({type: 'disconnected', reason: signal.reason, cleared: req.cleared, locks: Object.keys(locks).length}));
  });
  process.on('message', message => {
    if(message.type === 'inspect'){
      const shutdown = require('../../../../system/server').isGracefulShutdownInited();
      process.send({type: 'inspected', cleared: req.cleared, locks: Object.keys(locks).length, shutdown: Boolean(shutdown)});
    }
    if(message.type === 'finish'){
      release();
      process.send({type: 'finished', locks: Object.keys(locks).length});
    }
  });
  const res = req.getResponse();
  res.writeHead(200, {'Content-Type': 'text/event-stream'});
  res.write('data: started\n\n');
};
