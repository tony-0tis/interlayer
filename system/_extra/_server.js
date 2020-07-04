let http = require('http');
let https = require('https');
let async = require('async');
let fs = require('fs');
//let WebSocket = require('ws');
let helper = require('./index.js');;
let init = null;

let log = null;
let instantShutdownDelay;
let serverStat = {
  started: null,
  pings: []
};

process.on('uncaughtException', err => (log && log.c || console.error)(Date.now(), 'Caught exception:', err));

exports.start = (paths, conf)=>{
  global.logger = helper.logger(conf.logPath, conf.debug, conf.pingponglog);
  log = global.logger.create('__SRV');

  helper.initHelper();
  init = helper.init.init(paths, conf);

  if(conf.instantShutdownDelay){
    instantShutdownDelay = conf.instantShutdownDelay;
  }
  
  let server;
  if(conf.secure){
    if(!conf.secure.key || !conf.secure.cert){
      throw 'SECURE.KEY & SECURE.CERT MUST TO BE FILLED';
    }

    let opts = {
      key: fs.readFileSync(conf.secure.key),
      cert: fs.readFileSync(conf.secure.cert)
    };
    server = https.createServer(opts, requestFunc);
  }
  else{
    server = http.createServer(requestFunc);
  }
  server.listen(conf.port || 8080);
  serverStat.started = new Date();

  process.on('exit', function(){
    if(gracefulShutdownInited){
      return process.exit();
    }

    console.log('exit event', process.exitCode, serverStat);
    graceful_shutdown();
  });
  process.on('SIGINT', ()=>{
    log.i('SIGINT event', process.exitCode);
    graceful_shutdown(1);
  });
  process.on('SIGTERM', ()=>{
    log.ilog('SIGTERM event', process.exitCode);
    graceful_shutdown(1);
  });
  // let websocket;//https://github.com/websockets/ws#server-example
  // if(conf.websocket == true){
  //  websocket = new WebSocket.Server({server});
  // }

  log.i('server started on port: ' + (conf.port || 8080), conf.secure && 'https');
};

function requestFunc(request, response){
  if(gracefulShutdownInited){
    response.writeHead(503, {
      'Retry-After': init.config.retryAter || 10
    });
    response.end('Server Unavailable Or In Reboot');
    return;
  }

  let requestObject = init.reconstructRequest(request, response);
  let curReqLog = requestObject.modifyLog(log);
  let reqStart = Date.now();
  
  let moduleInf = init.getModule(requestObject.path);
  
  if(!moduleInf){
    return init.serve(requestObject, (err, data, code, headers)=>{
      if(data){
        curReqLog.i(requestObject.ip, 'SERVE', requestObject.path);
        return requestObject.end(data, code, headers, 'bin');
      }

      curReqLog.i('BAD', requestObject.ip, 'REQ: ' + requestObject.path, 'FROM: ' + (requestObject.headers.referer || '---'));
      return requestObject.end(`<title>${requestObject.i18n('Not found')}</title>${requestObject.i18n('<center>Error 404<br>Not found</center>')}`, 404);
    });
  }

  let disableNagleAlgoritm = false;
  if(init.config.disableNagleAlgoritm == true || moduleInf.meta.disableNagleAlgoritm == true){
    disableNagleAlgoritm = true;
  }
  if(moduleInf.meta.disableNagleAlgoritm == false){
    disableNagleAlgoritm = false;
  }
  if(disableNagleAlgoritm == true){
    request.socket.setNoDelay(); // Disable Nagle's algorytm
  }

  /*if(!helper.auth(moduleInf.meta, requestObject)){
    return requestObject.end('Access denied', 401, {'WWW-Authenticate': 'Basic realm="example"'});
  }*/ // not working yet

  async.auto({
    post: cb => helper.parsePost(requestObject, request, cb),
    middleware: ['post', (res, cb)=>{
      let middlewareTimeout = init.config.middlewareTimeout || moduleInf.meta.middlewareTimeout || 10;
      init.middleware(requestObject, moduleInf.meta, helper.timeout({timeout: middlewareTimeout}, {}, (e, data, code, headers)=>{
        if(e){
          res.data = {error: e};
          res.code = code || 200;
          res.headers = headers || {'Content-Type': 'application/json'};
          res.middlewareError = true;
          return cb(null, true);
        }

        cb();
      }));
    }],
    prerun: ['middleware', (res, cb)=>{
      if(!moduleInf.meta.prerun || res.middleware){
        return cb();
      }

      moduleInf.meta.prerun(requestObject, moduleInf.meta, cb);
    }],
    module: ['post', 'prerun', (res, cb)=>{
      if(res.middleware){
        return cb();
      }

      let poolId = requestObject.params.poolingId || requestObject.post.poolingId;
      let withPool = requestObject.params.withPooling || requestObject.post.withPooling;
      let next = helper.timeout(init.config, moduleInf.meta, (e, data, code, headers, type)=>{
        if(e){
          data = {error: e};
          code = code || 200;
          headers = headers || {'Content-Type': 'application/json'};
          type = null;
        }

        res.data = data;
        res.code = code || 200;
        res.headers = headers || {};
        res.type = type;
        cb();
      });

      if(poolId){
        if(!init.pools[poolId]){
          return next('BAD_POOL_ID');
        }

        return next(null, init.pools[poolId]);
      }
      else if(withPool){
        let id = helper.generateId();
        init.pools[id] = {
          poolingId: id
        };

        next(null, init.pools[id]);//eslint-disable-line callback-return
        next = (err, res)=>{
          init.pools[id] = err || res;
        };
      }

      try{
        return moduleInf.func(requestObject, next);
      }
      catch(e){
        curReqLog.e(e);
        return next(e);
      }
    }],
    json: ['module', (res, cb) =>{
      if(res.type == 'bin'){
        return cb();
      }

      if(moduleInf.meta.toJson || moduleInf.meta.contentType == 'json' || res.headers['Content-Type'] == 'application/json'){
        helper.toJson(res);
      }

      cb();
    }]
  },
  (err, res)=>{
    if(moduleInf.meta && moduleInf.meta.skipRequestLog !== true){
      curReqLog.i(
        requestObject.ip,
        'REQ: ' + requestObject.path,
        'FROM: ' + (requestObject.headers.referer || '---'),
        'GET: ' + helper.clearObj(requestObject.params, ['token']),
        'POST: ' + helper.clearObj(requestObject.post, ['token']),
        'len: ' + (res.data && res.data.length),
        'time: ' + ((Date.now() - reqStart) / 1000) + 's'
      );
    }

    if(err){
      return requestObject.error(err);
    }

    if(!requestObject.responseFree){
      requestObject.end(res.data, res.code, res.headers, res.type);
    }
  });
}

process.on('message', obj=> {
  switch(obj.type){
  case 'start': 
    exports.start(obj.paths, obj.config);
    break;
  case 'ping':
    if(process.send){
      process.send({
        type: 'pong',
        id: obj.id
      });
      log.pp('server obtain ping');
      log.pp('server send pong');
      startPing();
    }
    break;
  case 'pong':
    let ind = serverStat.pings.indexOf(obj.id);
    if(ind > -1){
      serverStat.pings.splice(ind, 1);
    }
    log.pp('server obtain pong');
    break;
  case 'reload':
    log.i('reload command');
    graceful_shutdown(0);
    break;
  case 'exit':
    log.i('exit command');
    graceful_shutdown(1);
    break;
  }

  if(obj == 'shutdown') {
    log.i('process message shutdown');
    graceful_shutdown(1);
  }
});

// only if this node in cluster  
function startPing(){
  if(startPing.started){
    return;
  }

  startPing.started = true;
  log.d('start ping-pong with cluster');

  global.intervals.add((deleteInterval)=>{
    if(serverStat.pings.length > 2){
      deleteInterval();
      log.c('cluster not answered');
      graceful_shutdown(0);
      return;
    }

    let ping = {
      type: 'ping',
      id: Date.now()
    };
    serverStat.pings.push(ping.id);

    process.send(ping);
    log.pp('server send ping');
  }, 1);
}
let gracefulShutdownInited;
function graceful_shutdown(code){
  if(gracefulShutdownInited){
    return;
  }
  let processLocks = helper.defReqFuncs && helper.defReqFuncs.getProcessLocks() || {};
  if(!helper || !Object.keys(processLocks).length){
    process.exit(code);
    return;
  }

  gracefulShutdownInited = Date.now();
  let si = setInterval(()=>{
    if(!Object.keys(processLocks).length || Date.now() - gracefulShutdownInited >= instantShutdownDelay || 1500){
      process.exit(code);
      clearInterval(si);
    }
  }, 50);
}