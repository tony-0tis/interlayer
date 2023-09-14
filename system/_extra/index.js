let path = require('path');
let JSV = require('JSV').JSV;
let crypto = require('crypto');
let fs = require('fs');
let qs = require('querystring');
let url = require('url');
let async = require('async');
let formidable = require('formidable');

exports.logger = require('./_logger.js');
exports.server = require('./_server.js');
exports.cluster = require('./_cluster.js');
exports.init = require('./_init.js');


exports.config = {};
exports.pathCheck = /[\w\d.\/]*/;
exports.infoApi = [];
exports.pools = [];
exports.middlewares = [];
exports.modules = {};
exports.servePaths = null;
exports.DAL_connections = null;
exports.emailSenders = null;
exports.i18n = {};
exports.serverStat = {
  started: null,
  pings: []
};


let log;
exports.initHelper = (config)=>{
  log = global.logger.create('__HELPERS');
  
  exports.config = config;

  exports.init.init();

  exports.defReqFuncs = require('./_defReqFuncs.js');
};

exports.finishInit = (websocket)=>{
  exports.init.runInits(websocket);
};

global.intervals = {
  _si: null,
  start(){
    this.stop();

    if(log) log.d('start global intervals');
    else console.debug('start global intervals');

    this._si = setInterval(()=>this._check(), 1000);
  },
  stop(){
    if(this._si == null) return;

    if(log) log.d('stop global intervals');
    else console.debug('stop global intervals');

    clearInterval(this._si);
  },
  _check(){
    for(let func of this._funcs){
      if(func.disabled) continue;

      if(func.timeout){
        if(typeof func.timeout === 'number'){
          if(func.triggered && Date.now() < func.triggered + func.timeout * 1000){
            continue;
          }
        }
        else{
          let d = new Date();
          let [year, month, date, day, hour, minute, second] = [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getMinutes(), d.getSeconds()];

          if(func.timeout.year != null && func.timeout.year != '*' && !String(func.timeout.year).split(',').includes(String(year))) continue;
          if(func.timeout.month != null && func.timeout.month != '*' && !String(func.timeout.month).split(',').includes(String(month))) continue;
          if(func.timeout.date != null && func.timeout.date != '*' && !String(func.timeout.date).split(',').includes(String(date))) continue;
          if(func.timeout.day != null && func.timeout.day != '*' && !String(func.timeout.day).split(',').includes(String(day))) continue;
          if(func.timeout.hour != null && func.timeout.hour != '*' && !String(func.timeout.hour).split(',').includes(String(hour))) continue;
          if(func.timeout.minute != null && func.timeout.minute != '*' && !String(func.timeout.minute).split(',').includes(String(minute))) continue;
          if(func.timeout.second != null && func.timeout.second != '*' && !String(func.timeout.second).split(',').includes(String(second))) continue;
          if(func.timeout.second == null || func.timeout.second === '*'){
            if(func.triggered && Date.now() < func.triggered + 60 * 1000){
              continue;
            }
          }
        }
      }

      func.func(this.del.bind(this, func.key));//send cb with delete current interval
      func.triggered = Date.now();
    }
  },
  _funcs: [],
  add(func, timeout){
    let key = Math.random() * Date.now();
    this._funcs.push({
      key: key,
      func: func,
      timeout: timeout,
      triggered: null
    });
    return key;
  },
  del(key){
    let ind = this._funcs.reduce((index,obj,ind)=>{
      if(obj.key == key){
        index = ind;
      }
      return index;
    }, -1);
    this._funcs.splice(ind, 1);
    return key;
  },
  enable(key){
    this.disable(key, false);
  },
  disable(key, val){
    this._funcs.forEach(obj=>{
      if(obj.key == key){
        if(val == false) {
          obj.disabled = false;
        }
        else obj.disabled = true;
      }
    });
  }
};
global.intervals.start();


/* *********** SERVER FUNCTIONS ************/
exports.checkPath = (serverPath, config, type, def)=>{
  if(config[type] && !Array.isArray(config[type])){
    throw 'config.' + type + ' must be Array';
  }

  config[type] = config[type] || [];

  if(config[type]){
    config[type] = config[type].concat(config[type]);
  }

  if(!config[type].length && def){
    config[type].push(path.join(serverPath, def));
  }

  config[type] = config[type].reduce((res, mpath)=>{
    if(!path.isAbsolute(mpath)){
      mpath = path.join(serverPath, mpath);
    }

    try{
      if(fs.statSync(mpath).isDirectory()){
        if(res.indexOf(mpath) < 0){
          res.push(mpath);
        }
      }
      else{
        console.log(type, 'path', mpath, 'is not directory');
      }
    }catch(e){
      console.log(type, 'path', mpath, 'not created');
    }
    return res;
  }, []);
};

let pingPongStarded = false;
exports.startPing = ()=>{
  if(pingPongStarded){
    return;
  }

  pingPongStarded = true;
  log.d('start ping-pong with cluster');

  global.intervals.add((deleteInterval)=>{
    if(exports.serverStat.pings.length > 2){
      deleteInterval();
      log.c('cluster not answered');
      exports.graceful_shutdown(0);
      return;
    }

    let ping = {
      type: 'ping',
      id: Date.now()
    };
    exports.serverStat.pings.push(ping.id);

    process.send(ping);
    if(exports.config.pingponglog) log.d('server send ping');
  }, 1);
};

let gracefulShutdownInited = null;
let instantShutdownDelay = null;
exports.setInstantShutdownDelay = delay=>{
  instantShutdownDelay = delay;
};
exports.isGracefulShutdownInited = ()=>{
  return gracefulShutdownInited;
}
exports.graceful_shutdown = (code) => {
  if(gracefulShutdownInited){
    return;
  }
  let processLocks = exports.defReqFuncs && exports.defReqFuncs.getProcessLocks() || {};
  if(!Object.keys(processLocks).length){
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
};

exports.getModule = function(moduleName){
  if(exports.modules[moduleName]){
    return exports.modules[moduleName];
  }

  moduleName = moduleName.replace(/\/$/, '').replace(/^\//, '');

  if(exports.modules[moduleName]){
    return exports.modules[moduleName];
  }

  let subs = moduleName.split('/');
  if(subs.length > 1){
    if(exports.modules[subs[0] + '/*']){
      return exports.modules[subs[0] + '/*'];
    }
  }

  return false;
};

exports.reconstructRequest = function(request, response){
  let requestObject = {
    config: exports.config,
    DAL: exports.DAL_connections,
    mail: exports.emailSenders,

    id: exports.generateId(),
    url: request.url,
    path: decodeURIComponent(url.parse(request.url).pathname.substring(1)),
    method: request.method,
    isPost: request.method == 'POST',
    headers: JSON.parse(JSON.stringify(request.headers)),
    langs: (request.headers['accept-language'] || 'en').match(/(\w{2}(-\w{2})?)/g),
    ip: request.headers['x-forwarded-for'] ||
      request.connection.remoteAddress ||
      request.socket && request.socket.remoteAddress ||
      request.connection.socket && request.connection.socket.remoteAddress,
    responseCookies: {},
    cookies: {},
    params: {},
    post: {}
  };

  requestObject.params = qs.parse(url.parse(requestObject.url).query);
  for(let i in requestObject.params){
    if(exports.isBoolean(requestObject.params[i])){
      requestObject[i] = Boolean(requestObject.params[i]);
    }
  }

  if(requestObject.params.callback){
    requestObject.jsonpCallback = requestObject.params.callback;
    delete requestObject.params.callback;
  }

  if(requestObject.headers.cookie){
    requestObject.headers.cookie.split(';').forEach(cookie=>{
      let parts = cookie.split('=');
      requestObject.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }

  Object.keys(exports.defReqFuncs).forEach(k=>{
    requestObject[k] = exports.defReqFuncs[k];
  });

  //modifyLog defined in defReqFuncs
  requestObject.log = requestObject.modifyLog(global.logger.create());


  let originalResposeEnd;
  requestObject.lockShutdown();

  requestObject.getResponse = ()=>{
    originalResposeEnd = response.end;
    response.end = function(...args){
      requestObject.unlockShutdown();
      if(!requestObject || requestObject.ended){
        if(requestObject){
          clearRequest();
        }

        requestObject = undefined;
        throw 'FORBIDEN';
      }

      requestObject.ended = true;
      response.end = originalResposeEnd;
      originalResposeEnd = undefined;
      response.end(...args);
      delete response.end;

      clearRequest();
    };

    requestObject.responseFree = true;
    return response;
  };

  requestObject.getRequest = ()=>request;

  requestObject.end = (text='', code=200, headers={'Content-Type': 'text/html; charset=utf-8'}, type='text')=>{
    requestObject.unlockShutdown();
    if(!requestObject || requestObject.ended){
      requestObject = undefined;
      clearRequest();
      return;
    }

    requestObject.ended = true;

    if(type == 'bin'){
      text = Buffer.from(text, 'binary');
      headers['Content-Length'] = text.length;
    }
    else{
      let asObject = false;
      if(typeof text == 'object' && text instanceof Buffer != true && text !== null){
        try{
          text = JSON.stringify(text);
        }catch(e){}
      }
      else if(typeof text == 'function' || typeof text == 'boolean'){
        text = text.toString();
        asObject = true;
      }
      else if(typeof text == 'undefined' || typeof text == 'object' && text === null){
        text = String(text);
        asObject = true;
      }
      else if(typeof text == 'number'){
        text = text.toString();
      }
      else if(typeof text == 'symbol'){
        text = '';
      }

      headers['Content-Length'] = Buffer.from(text).length;

      if(requestObject.jsonpCallback){
        if(headers['Content-Type'] == 'application/json' || asObject){
          text = `${requestObject.jsonpCallback}(${text});`;
        }
        else{
          text = `${requestObject.jsonpCallback}("${text}");`;
        }
      }
    }

    if(exports.config.defaultHeaders){
      for(let i in exports.config.defaultHeaders){
        if(!exports.config.defaultHeaders.hasOwnProperty(i)){
          continue;
        }
        
        headers[i] = exports.config.defaultHeaders[i];
      }
    }

    if(requestObject.responseCookies){
      let cookies = [];
      let expires = new Date();
      expires.setDate(expires.getDate() + 5);
      
      for(let i in requestObject.responseCookies){
        if(!requestObject.responseCookies.hasOwnProperty(i)){
          continue;
        }
        
        cookies.push(i + '=' + encodeURIComponent(requestObject.responseCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
      }
      
      headers['Set-Cookie'] = cookies;
    }

    if(!text){
      code = 204;
    }

    response.writeHead(code, headers);
    
    if(type == 'bin'){
      response.write(text, 'binary');
    }
    else{
      response.write(text);
    }

    response.end();

    clearRequest();
  };

  var clearRequest = ()=>{
    if(requestObject){
      //objects
      delete requestObject.config;
      delete requestObject.DAL;
      delete requestObject.mail;
      delete requestObject.log;

      //current request functions
      delete requestObject.getResponse;
      delete requestObject.getRequest;
      delete requestObject.end;

      // default functions
      Object.keys(exports.defReqFuncs).forEach(k=>{
        delete requestObject[k];
      });
    }

    if(originalResposeEnd){
      response.end = originalResposeEnd;
    }

    requestObject.cleared = true;

    originalResposeEnd = undefined;
    requestObject = undefined;
    clearRequest = undefined;
    request = undefined;
  };

  return requestObject;
};

exports.middleware = function(request, moduleMeta, cb){
  if(!exports.middlewares.length){
    return cb();
  }

  let count = 0;
  async.whilst(
    cb=>cb(null, count < exports.middlewares.length),
    cb=>{
      let middleware = exports.middlewares[count];
      count++;
      
      if(middleware.triggers['*']){
        middleware.triggers['*'](request, moduleMeta, cb);
        return;
      }

      async.series(Object.keys(middleware.triggers).reduce((res, trigger)=>{
        let run = false;
        let isMeta = trigger.match(/^meta\./);
        let isRequest = trigger.match(/^request\./);
        
        if(isMeta || isRequest){
          let p = trigger.split('.').splice(1);
          let objPath = isMeta ? moduleMeta : request;
          for(let i in p){
            if(!p.hasOwnProperty(i)){
              continue;
            }
            
            if(objPath[p[i]]){
              objPath = objPath[p[i]];
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
};

exports.serve = function(request, cb){
  if(!exports.servePaths){
    return cb();
  }

  let curLog = request.modifyLog(log);

  curLog.d('Try to serve', request.path);
  let paths = [...exports.servePaths];
  let done = false;
  async.whilst(
    cb=>cb(null, !done),
    cb=>{
      if(paths.length == 0){
        done = true;
        return cb();
      }

      let p = paths.shift();
      curLog.d('check path', path.join(p, request.path));
      
      if(!p){
        return cb();
      }
      
      let stat;
      try{
        stat = fs.lstatSync(path.join(p, request.path));
      }catch(e){
        curLog.d('No requested file', path.join(p, request.path));
        return cb();
      }

      if(stat && stat.isDirectory()){
        if (['\\', '/'].indexOf(request.path.slice(-1)) == -1){
          request.path += '/';
        }
        
        request.path += 'index.html';
      }
      
      request.getFile(path.join(p, request.path), (err, res, headers)=>{
        if(err){
          curLog.d(path.join(p, request.path), err, res, headers);
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
};

exports.parsePost = function(reqObj, request, cb){
  if(!reqObj.isPost){
    return cb();
  }

  formidable({multiples: true}).parse(request, (err, fields, files)=>{
    if(err) return cb(err);
    reqObj.post = fields;
    reqObj.files = files;
    cb();
  });
};


/* *********** OTHER HELPER FUNCTIONS ************/
exports.generateId = ()=>{
  let rtn = '';
  for (let i = 0; i < 8; i++) {
    rtn += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 62));
  }
  return rtn;
};

exports.toJson = res=>{
  try{
    res.data = JSON.stringify(res.data);
    res.headers['Content-Type'] = 'application/json';
  }catch(e){
    log.e('toJson.JSON.stringify error', e, 'on obj', res);
  }
};

exports.clearObj = (obj, toRemove)=>{
  if(!obj) return '{}';

  try{
    let clonedObject = JSON.parse(JSON.stringify(obj));
    if(Array.isArray(toRemove)){
      for(let i in toRemove){
        if(!toRemove.hasOwnProperty(i)){
          continue;
        }
        delete clonedObject[toRemove[i]];
      }
    }
    return JSON.stringify(clonedObject);
  }catch(e){
    log.e('clearObj.JSON.stringify error', e, 'on obj', obj);
    return '';
  }
};

exports.timeout = (config, meta, cb)=>{
  var called = false;

  global.intervals.add((del)=>{
    del();

    if(!called){
      called = true;
      return cb('TIMEOUT', null, 408);
    }
  }, meta.timeout || config.timeout || 60);

  return (...args)=>{
    if(called){
      log.e('request already ended by timeout', args);
      return;
    }

    called = true;
    return cb(...args);
  };
};

exports.auth = (module, request)=>{
  if(module.auth/* || module.rights*/){
    let header = request.headers.authorization || '';
    let token = header.split(/\s+/).pop() || '';
    let auth = Buffer.from(token, 'base64').toString();
    //let parts = auth.split(':');
    auth = crypto.createHash('md5').update(auth).digest('hex');
    let moduleAuth = module.auth == 'default' && exports.defaultAuth ? exports.defaultAuth : module.auth;

    if(moduleAuth !== true && moduleAuth != auth){
      return false;
    }
  }

  return true;
};

exports.isBoolean = val=>{
  if(String(val).toLowerCase().match(/^(true|false)$/)){
    return true;
  }
  
  return false;
};

exports.JSV = (params, schema, envId)=>JSV.createEnvironment(envId).validate(params, schema);

exports.mime = function(file, fallback){
  return exports.mimeTypes[path.extname(file).toLowerCase()] || fallback || 'application/octet-stream';
};

// List of most common mime-types, stolen from Rack.
exports.mimeTypes = { 
  '.3gp': 'video/3gpp', '.a': 'application/octet-stream','.ai': 'application/postscript',
  '.aif': 'audio/x-aiff','.aiff': 'audio/x-aiff','.asc': 'application/pgp-signature',
  '.asf': 'video/x-ms-asf','.asm': 'text/x-asm','.asx': 'video/x-ms-asf',
  '.atom': 'application/atom+xml','.au': 'audio/basic','.avi': 'video/x-msvideo',
  '.bat': 'application/x-msdownload','.bin': 'application/octet-stream','.bmp': 'image/bmp',
  '.bz2': 'application/x-bzip2','.c': 'text/x-c','.cab': 'application/vnd.ms-cab-compressed',
  '.cc': 'text/x-c','.chm': 'application/vnd.ms-htmlhelp','.class': 'application/octet-stream',
  '.com': 'application/x-msdownload','.conf': 'text/plain','.cpp': 'text/x-c',
  '.crt': 'application/x-x509-ca-cert','.css': 'text/css','.csv': 'text/csv','.cxx': 'text/x-c',
  '.deb': 'application/x-debian-package','.der': 'application/x-x509-ca-cert','.diff': 'text/x-diff',
  '.djv': 'image/vnd.djvu','.djvu': 'image/vnd.djvu','.dll': 'application/x-msdownload',
  '.dmg': 'application/octet-stream','.doc': 'application/msword','.dot': 'application/msword',
  '.dtd': 'application/xml-dtd','.dvi': 'application/x-dvi','.ear': 'application/java-archive',
  '.eml': 'message/rfc822','.eps': 'application/postscript','.exe': 'application/x-msdownload',
  '.f': 'text/x-fortran','.f77': 'text/x-fortran','.f90': 'text/x-fortran','.flv': 'video/x-flv',
  '.for': 'text/x-fortran','.gem': 'application/octet-stream','.gemspec': 'text/x-script.ruby',
  '.gif': 'image/gif','.gz': 'application/x-gzip','.h': 'text/x-c','.hh': 'text/x-c','.htm': 'text/html',
  '.html': 'text/html','.ico': 'image/vnd.microsoft.icon','.ics': 'text/calendar','.ifb': 'text/calendar',
  '.iso': 'application/octet-stream','.jar': 'application/java-archive','.java': 'text/x-java-source',
  '.jnlp': 'application/x-java-jnlp-file','.jpeg': 'image/jpeg','.jpg': 'image/jpeg',
  '.js': 'application/javascript','.json': 'application/json','.log': 'text/plain',
  '.m3u': 'audio/x-mpegurl','.m4v': 'video/mp4','.man': 'text/troff','.mathml': 'application/mathml+xml',
  '.mbox': 'application/mbox','.mdoc': 'text/troff','.me': 'text/troff','.mid': 'audio/midi',
  '.midi': 'audio/midi','.mime': 'message/rfc822','.mml': 'application/mathml+xml','.mng': 'video/x-mng',
  '.mov': 'video/quicktime','.mp3': 'audio/mpeg','.mp4': 'video/mp4','.mp4v': 'video/mp4',
  '.mpeg': 'video/mpeg','.mpg': 'video/mpeg','.ms': 'text/troff','.msi': 'application/x-msdownload',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet','.odt': 'application/vnd.oasis.opendocument.text',
  '.ogg': 'application/ogg','.p': 'text/x-pascal','.pas': 'text/x-pascal','.pbm': 'image/x-portable-bitmap',
  '.pdf': 'application/pdf','.pem': 'application/x-x509-ca-cert','.pgm': 'image/x-portable-graymap',
  '.pgp': 'application/pgp-encrypted','.pkg': 'application/octet-stream','.pl': 'text/x-script.perl',
  '.pm': 'text/x-script.perl-module','.png': 'image/png','.pnm': 'image/x-portable-anymap',
  '.ppm': 'image/x-portable-pixmap','.pps': 'application/vnd.ms-powerpoint',
  '.ppt': 'application/vnd.ms-powerpoint','.ps': 'application/postscript',
  '.psd': 'image/vnd.adobe.photoshop',
  '.py': 'text/x-script.python','.qt': 'video/quicktime','.ra': 'audio/x-pn-realaudio',
  '.rake': 'text/x-script.ruby','.ram': 'audio/x-pn-realaudio','.rar': 'application/x-rar-compressed',
  '.rb': 'text/x-script.ruby','.rdf': 'application/rdf+xml','.roff': 'text/troff',
  '.rpm': 'application/x-redhat-package-manager','.rss': 'application/rss+xml','.rtf': 'application/rtf',
  '.ru': 'text/x-script.ruby','.s': 'text/x-asm','.sgm': 'text/sgml','.sgml': 'text/sgml',
  '.sh': 'application/x-sh','.sig': 'application/pgp-signature','.snd': 'audio/basic',
  '.so': 'application/octet-stream','.svg': 'image/svg+xml','.svgz': 'image/svg+xml',
  '.swf': 'application/x-shockwave-flash','.t': 'text/troff','.tar': 'application/x-tar',
  '.tbz': 'application/x-bzip-compressed-tar','.tcl': 'application/x-tcl','.tex': 'application/x-tex',
  '.texi': 'application/x-texinfo','.texinfo': 'application/x-texinfo','.text': 'text/plain',
  '.tif': 'image/tiff','.tiff': 'image/tiff','.torrent': 'application/x-bittorrent','.tr': 'text/troff',
  '.txt': 'text/plain','.vcf': 'text/x-vcard','.vcs': 'text/x-vcalendar','.vrml': 'model/vrml',
  '.war': 'application/java-archive','.wav': 'audio/x-wav','.wma': 'audio/x-ms-wma','.wmv': 'video/x-ms-wmv',
  '.wmx': 'video/x-ms-wmx','.wrl': 'model/vrml','.wsdl': 'application/wsdl+xml','.xbm': 'image/x-xbitmap',
  '.xhtml': 'application/xhtml+xml','.xls': 'application/vnd.ms-excel','.xml': 'application/xml',
  '.xpm': 'image/x-xpixmap','.xsl': 'application/xml','.xslt': 'application/xslt+xml','.yaml': 'text/yaml',
  '.yml': 'text/yaml','.zip': 'application/zip','.webp': 'image/webp'
};