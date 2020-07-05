let http = require('http');
let https = require('https');
let async = require('async');
let fs = require('fs');
let WebSocket = require('ws');
let helper = require('./index.js');;

let log = null;
exports.addLog = (...args)=>{
  if(log) log.i(...args);
  else console.log(...args);
}

process.on('uncaughtException', err => (log && log.c || console.error)(Date.now(), 'Caught exception:', err));

exports.start = (config)=>{
  global.logger = helper.logger(config.logPath, config.debug);
  log = global.logger.create('__SRV');

  helper.initHelper(config);

  if(config.instantShutdownDelay){
    helper.instantShutdownDelay = config.instantShutdownDelay;
  }
  
  let server;
  if(config.secure){
    if(!config.secure.key || !config.secure.cert){
      throw 'SECURE.KEY & SECURE.CERT MUST TO BE FILLED';
    }

    let opts = {
      key: fs.readFileSync(config.secure.key),
      cert: fs.readFileSync(config.secure.cert)
    };
    server = https.createServer(opts, requestFunc);
  }
  else{
    server = http.createServer(requestFunc);
  }

  server.listen(config.port || 8080);
  helper.serverStat.started = new Date();

  log.i('server started on port: ' + (config.port || 8080), config.secure && 'https');

  let websocket;//https://github.com/websockets/ws#server-example
  if(config.websocket){
    if(helper.isBoolean(config.websocket) && config.websocket === true){
      websocket = new WebSocket.Server({server});
      log.i('websocket inited on the same port');
    }
    else{
      websocket = new WebSocket.Server(config.websocket);
      log.i('websocket inited on port:' + config.websocket.port);
    }
  }

  helper.finishInit(websocket);
};

function requestFunc(request, response){
  if(helper.gracefulShutdownInited){
    response.writeHead(503, {
      'Retry-After': helper.config.retryAter || 10
    });
    response.end('Server Unavailable Or In Reboot');
    return;
  }

  let reqStart = Date.now();
  let requestObject = helper.reconstructRequest(request, response);
  let curReqLog = requestObject.modifyLog(log);
  
  curReqLog.d(
    'Init request',
    requestObject.ip,
    'REQ: ' + requestObject.path,
    'FROM: ' + (requestObject.headers.referer || '---')
  );
  
  
  let moduleInf = helper.getModule(requestObject.path);
  if(!moduleInf){
    return helper.serve(requestObject, (err, data, code, headers)=>{
      if(data){
        curReqLog.i(requestObject.ip, 'SERVE', requestObject.path);
        return requestObject.end(data, code, headers, 'bin');
      }

      curReqLog.i('BAD/404', requestObject.ip, 'REQ: ' + requestObject.path, 'FROM: ' + (requestObject.headers.referer || '---'));
      if(helper.config.useHttpErrorFiles){
        return requestObject.getView('404.html', (err, data, headers)=>{
          if(err){
            requestObject.end(`<title>${requestObject.i18n('Not found')}</title>${requestObject.i18n('<center>Error 404<br>Not found</center>')}`, 404);
          }
          else{
            requestObject.end(data, 404, headers);
          }
        });
      }
      return requestObject.end(`<title>${requestObject.i18n('Not found')}</title>${requestObject.i18n('<center>Error 404<br>Not found</center>')}`, 404);
    });
  }


  let noDelay = true;
  if(helper.isBoolean(helper.config.noDelay)) noDelay = helper.config.noDelay;
  if(helper.isBoolean(moduleInf.meta.noDelay)) noDelay = moduleInf.meta.noDelay;
  request.socket.setNoDelay(noDelay); // Disable/enable Nagle's algorytm

  /*if(!helper.auth(moduleInf.meta, requestObject)){
    return requestObject.end('Access denied', 401, {'WWW-Authenticate': 'Basic realm="example"'});
  }*/ // not working yet

  async.auto({
    post: cb =>helper.parsePost(requestObject, request, cb),
    middleware: ['post', (res, cb)=>{
      let middlewareTimeout = helper.config.middlewareTimeout || moduleInf.meta.middlewareTimeout || 10;
      helper.middleware(requestObject, moduleInf.meta, helper.timeout({timeout: middlewareTimeout}, {}, (e, data, code, headers)=>{
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
      let next = helper.timeout(helper.config, moduleInf.meta, (e, data, code, headers, type)=>{
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
        if(!helper.pools[poolId]){
          return next('BAD_POOL_ID');
        }

        return next(null, helper.pools[poolId]);
      }
      else if(withPool){
        let id = helper.generateId();
        helper.pools[id] = {
          poolingId: id
        };

        next(null, helper.pools[id]);//eslint-disable-line callback-return
        next = (err, res)=>{
          helper.pools[id] = err || res;
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