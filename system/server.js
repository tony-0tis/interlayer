const { createServer: createHttpServer} = require('http');
const { createServer: createHttpsServer} = require('https');
const { parse: queryParse } = require('querystring');
const { parse } = require('url');
const { Server } = require('ws');
const { lstatSync, readFileSync } = require('fs');
const { join } = require('path');
const { whilst, auto, series } = require('async');

const { init : initInits } = require('./inits.js');
const { init: initProcessFunctions} = require('./_processFunctions.js');
const { generateId, modifyRequest, getModule, parsePost, processInits } = require('./utils.js');

exports.server = null;

exports.initServer = config => {
  const log = global.logger('_SERVER');

  exports.server = new iServer(log, config);
};

class iServer{
  #log = null;
  #config = null;
  #requestPools = [];
  #inits = {};
  #processFunctions = {};

  static log = null;
  static processLocks = {};
  static gracefulShutdownInited = null;
  static instantShutdownDelay = null;

  constructor(log, config){
    this.#log = log;
    this.constructor.log = log;
    this.#config = config;

    this.#inits = initInits(config);
    this.#processFunctions = initProcessFunctions(this.constructor.processLocks, this.#inits);

    if(config.instantShutdownDelay){
      this.constructor.instantShutdownDelay = config.instantShutdownDelay;
    }

    let server;
    if(!config.secure) server = createHttpServer();
    else{
      server = createHttpsServer({
        key: readFileSync(config.secure.key),
        cert: readFileSync(config.secure.cert)
      });
    }
    server.listen(config.port || 8080);
    log.i(`${config.secure ? 'https' : 'http'} server started on port: ${(config.port || 8080)}`);

    server.on('request', this.#processRequest.bind(this));

    /* sockets */
    let websocket;//https://github.com/websockets/ws#server-example
    if(config.websocket){
      if(config.websocket === true){
        websocket = new Server({server});
        log.i('websocket inited on the same port');
      }
      else{
        websocket = new Server(config.websocket);
        log.i('websocket inited on port:' + config.websocket.port);
      }
    }

    if(config.startInits){
      log.i('Start module inits');
      processInits(this.#inits, config, websocket, this.#processFunctions);
    }
  }

  #processRequest(request, response){
    if(this.constructor.gracefulShutdownInited){
      response.writeHead(503, {
        'Retry-After': this.#config.retryAter || 10
      });
      response.end('Server Unavailable Or In Reboot');
      return;
    }

    const reqStart = Date.now();
    const requestMod = {
      config: this.#config,
      DAL: this.#inits.dal,
      mail: this.#inits.mail,
      id: generateId(),
      url: request.url,
      path: decodeURIComponent(parse(request.url).pathname.substring(1)),
      method: request.method,
      isPost: request.method == 'POST',
      headers: {...request.headers},
      langs: (request.headers['accept-language'] || 'en').match(/(\w{2}(-\w{2})?)/g),
      ip: request.headers['x-forwarded-for'] ||request.connection.remoteAddress || request.socket && request.socket.remoteAddress || request.connection.socket && request.connection.socket.remoteAddress,
      responseCookies: {},
      cookies: {},
      params: queryParse(parse(request.url).query),
      post: {},
      jsonpCallback: null
    };

    const modLog = modifyRequest(requestMod, request, response, this.#processFunctions, this.#log);

    modLog.d(
      'Init request',
      requestMod.ip,
      'REQ: ' + requestMod.path,
      'FROM: ' + (requestMod.headers.referer || '---')
    );

    const moduleInf = getModule(this.#inits.modules, requestMod.path);
    if(!moduleInf){
      return this.#serve(requestMod, (err, data, code, headers)=>{
        if(data){
          modLog.i(requestMod.ip, 'SERVE', requestMod.path);
          return requestMod.end(data, code, headers, 'bin');
        }

        modLog.i('BAD/404', requestMod.ip, 'REQ: ' + requestMod.path, 'FROM: ' + (requestMod.headers.referer || '---'));
        if(this.#config.useHttpErrorFiles){
          return requestMod.getView('404.html', (err, data, headers)=>{
            if(err){
              requestMod.end(`<title>${requestMod.i18n('Not found')}</title>${requestMod.i18n('<center>Error 404<br>Not found</center>')}`, 404);
            }
            else{
              requestMod.end(data, 404, headers);
            }
          });
        }
        return requestMod.end(`<title>${requestMod.i18n('Not found')}</title>${requestMod.i18n('<center>Error 404<br>Not found</center>')}`, 404);
      });
    }

    let noDelay = true;
    if(this.#config.noDelay != null) noDelay = this.#config.noDelay;
    if(moduleInf.meta.noDelay != null) noDelay = moduleInf.meta.noDelay;
    request.socket.setNoDelay(noDelay); // Disable/enable Nagle's algorytm

    auto({
      post: cb => {
        if(this.#config.skipParsePost || moduleInf.meta.skipParsePost) return cb();
        parsePost(requestMod, request, cb);
      },
      middleware: ['post', (res, cb)=>{
        const middlewareTimeout = this.#config.middlewareTimeout || moduleInf.meta.middlewareTimeout || 10;
        this.#middleware(requestMod, moduleInf.meta, this.#timeoutRequest({timeout: middlewareTimeout}, {}, (e, data, code, headers)=>{
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

        moduleInf.meta.prerun(requestMod, moduleInf.meta, cb);
      }],
      module: ['post', 'prerun', (res, cb)=>{
        if(res.middleware){
          return cb();
        }

        let poolId = requestMod.params.poolingId || requestMod.post.poolingId;
        let withPool = requestMod.params.withPooling || requestMod.post.withPooling;
        let next = this.#timeoutRequest(this.#config, moduleInf.meta, (e, data, code, headers, type)=>{
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
          if(!this.#requestPools[poolId]){
            return next('BAD_POOL_ID');
          }

          return next(null, this.#requestPools[poolId]);
        }
        else if(withPool){
          let id = generateId();
          this.#requestPools[id] = {
            poolingId: id
          };

          next(null, this.#requestPools[id]);//eslint-disable-line callback-return
          next = (err, res)=>{
            this.#requestPools[id] = err || res;
          };
        }

        try{
          return moduleInf.func(requestMod, next);
        }
        catch(e){
          modLog.e(e);
          return next(e);
        }
      }],
      json: ['module', (res, cb) =>{
        if(res.type == 'bin'){
          return cb();
        }

        if(moduleInf.meta.toJson || moduleInf.meta.contentType == 'json' || res.headers['Content-Type'] == 'application/json'){
          moduleInf.helpers.toJson(res);
        }

        cb();
      }]
    }, (err, res)=>{
      if(moduleInf.meta && moduleInf.meta.skipRequestLog !== true){
        modLog.i(
          requestMod.ip,
          'REQ: ' + requestMod.path,
          'FROM: ' + (requestMod.headers.referer || '---'),
          'GET: ' + requestMod.helpers.clearObj(requestMod.params, ['token']),
          'POST: ' + requestMod.helpers.clearObj(requestMod.post, ['token']),
          'len: ' + (res.data && res.data.length),
          'time: ' + ((Date.now() - reqStart) / 1000) + 's'
        );
      }

      if(err){
        return requestMod.error(err);
      }

      if(!requestMod.responseFree){
        requestMod.end(res.data, res.code, res.headers, res.type);
      }
    });
  }

  #timeoutRequest(config, meta, cb){
    let called = false;

    global.intervals.add((del)=>{
      del();

      if(!called){
        called = true;
        return cb('TIMEOUT', null, 408);
      }
    }, meta.timeout || config.timeout || 60);

    return (...args)=>{
      if(called){
        console.error('request already ended by timeout', args, new Error());
        return;
      }

      called = true;
      return cb(...args);
    };
  }

  #serve(request, cb) {
    if(!this.#inits.serve){
      return cb();
    }

    const modLog = request.modifyLog(this.#log);

    modLog.d('Try to serve', request.path);
    let paths = [...this.#inits.serve];
    let done = false;
    whilst(
      cb=>cb(null, !done),
      cb=>{
        if(paths.length == 0){
          done = true;
          return cb();
        }

        let path = paths.shift();
        modLog.d('check path', join(path, request.path));
        
        if(!path){
          return cb();
        }
        
        let stat;
        try{
          stat = lstatSync(join(path, request.path));
        }catch(e){
          modLog.d('No requested file', join(path, request.path));
          return cb();
        }

        if(stat && stat.isDirectory()){
          if (['\\', '/'].indexOf(request.path.slice(-1)) == -1){
            request.path += '/';
          }
          
          request.path += 'index.html';
        }
        
        request.getFile(join(path, request.path), (err, res, headers)=>{
          if(err){
            modLog.d(join(path, request.path), err, res, headers);
            return cb();
          }

          done = true;
          cb(null, [res, headers]);
        });
      },
      (err, res)=>{
        if(err){
          return cb(err);
        }

        if(!res){
          return cb('NOT FOUND', null, 404);
        }

        cb(null, res[0], 200, res[1]);
      }
    );
  }

  #middleware(request, moduleMeta, cb){
    if(!this.#inits.middlewares.length){
      return cb();
    }

    let count = 0;
    whilst(
      cb=>cb(null, count < this.#inits.middlewares.length),
      cb=>{
        let middleware = this.#inits.middlewares[count];
        count++;
        
        if(middleware.triggers['*']){
          middleware.triggers['*'](request, moduleMeta, cb);
          return;
        }

        series(Object.keys(middleware.triggers).reduce((res, trigger)=>{
          let run = false;
          let isMeta = trigger.match(/^meta\./);
          let isRequest = trigger.match(/^request\./);
          
          if(isMeta || isRequest){
            let paths = trigger.split('.').splice(1);
            let objPath = isMeta ? moduleMeta : request;
            for(const path of paths){          
              if(objPath[path]){
                objPath = objPath[path];
                run = true;
              }
              else{
                run = false;
                break;
              }
            }
          }
          
          if(run){
            res.push(middleware.triggers[trigger].bind({}, request, moduleMeta));
          }
          
          return res;
        }, []), cb);
      },
      cb
    );
  }
}

exports.serverLog = (...args) => {
  if(iServer.log) iServer.log.i(...args);
  else console.log(...args);
};

exports.isGracefulShutdownInited = ()=>{
  return iServer.gracefulShutdownInited;
};
exports.graceful_shutdown = code => {
  if(iServer.gracefulShutdownInited){
    return;
  }

  if(!Object.keys(iServer.processLocks).length){
    process.exit(code);
    return;
  }

  iServer.gracefulShutdownInited = Date.now();
  const si = setInterval(()=>{
    if(!Object.keys(iServer.processLocks).length || Date.now() - iServer.gracefulShutdownInited >= (iServer.instantShutdownDelay || 1500)){
      process.exit(code);
      clearInterval(si);
    }
  }, 50);
};