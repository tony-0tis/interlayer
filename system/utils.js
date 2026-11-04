const { join, isAbsolute, dirname, extname } = require('path');
const { statSync, watch, readdirSync, stat, readFile, readFileSync } = require('fs');
const { JSV } = require('JSV');
const { randomUUID } = require('crypto');

exports.validateConfigUtils = config => {
  if(!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('config must be an object');
  for(const name of ['port', 'workers', 'timeout', 'middlewareTimeout', 'instantShutdownDelay', 'retryAter']){
    const value = config[name];
    if(value == null) continue;
    const valid = name === 'port' ? Number.isInteger(value) && value >= 0 && value <= 65535 :
      name === 'workers' ? Number.isInteger(value) && value >= 1 : Number.isFinite(value) && value > 0;
    if(!valid) throw new TypeError('Invalid config.' + name);
  }
};

exports.pathCheck = /^[A-Za-z0-9_./]+$/;

exports.getRootPathUtils = error => {
  return dirname(error.stack.split('\n').splice(2, 1)[0].match(/at\s?[^(]*\(?([^)]+)\)?/)[1]);
};

exports.initLoggerUtils = config => {
  global.logger =  require('./logger.js')(config.logPath, config.debug, config.disableLogFile).create;
  global.logger.create = global.logger;
};

exports.checkPathUtils = (serverPath, config, type, def) => {
  if(config[type] && !Array.isArray(config[type])){
    throw 'config.' + type + ' must be Array';
  }

  config[type] = config[type] || [];

  if(!config[type].length && def){
    config[type].push(join(serverPath, def));
  }

  config[type] = config[type].reduce((res, mpath)=>{
    if(!isAbsolute(mpath)){
      mpath = join(serverPath, mpath);
    }

    try{
      if(statSync(mpath).isDirectory()){
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

exports.generateId = () => {
  let rtn = '';
  for (let i = 0; i < 8; i++) {
    rtn += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 62));
  }
  return rtn;
};

exports.getUrlUtils = (moduleName, methodName, moduleObject, meta) => {
  if(typeof meta.path === 'string' && exports.pathCheck.test(meta.path)){
    methodName = meta.path;
  }

  if(moduleObject.addToRoot || meta.addToRoot){
    return methodName;
  }

  return moduleName + '/' + methodName;
};

exports.getModuleUtils = ({ modules }, moduleName) => {
  if(Object.prototype.hasOwnProperty.call(modules, moduleName)){
    return modules[moduleName];
  }

  moduleName = moduleName.replace(/\/$/, '').replace(/^\//, '');

  if(Object.prototype.hasOwnProperty.call(modules, moduleName)){
    return modules[moduleName];
  }

  const path = moduleName.split('/');
  if(path.length > 1){
    if(Object.prototype.hasOwnProperty.call(modules, path[0] + '/*')){
      return modules[path[0] + '/*'];
    }
  }

  return false;
};

exports.modifyRequestUtils = (requestMod, request, response, processFunctions, log) => {
  for(let i in requestMod.params){
    if(processFunctions.helpers.isBoolean(requestMod.params[i])){
      requestMod.params[i] = String(requestMod.params[i]).toLowerCase() === 'true';
    }
  }

  if(requestMod.params.callback){
    const callback = requestMod.params.callback;
    if(typeof callback === 'string' && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback)){
      requestMod.jsonpCallback = callback;
    }
    delete requestMod.params.callback;
  }

  if(requestMod.headers.cookie){
    requestMod.headers.cookie.split(';').forEach(cookie=>{
      const parts = cookie.split('=');
      requestMod.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }

  Object.keys(processFunctions).forEach(k=>{
    requestMod[k] = processFunctions[k];
  });

  //modifyLog defined in defReqFuncs
  requestMod.log = requestMod.modifyLog(global.logger());
  const modLog = requestMod.modifyLog(log);


  const controller = new AbortController();
  const originalEnd = response.end;
  const terminalListeners = new Set();
  const manualResponseListeners = new Set();
  let finished = false;
  let terminating = false;
  requestMod.signal = controller.signal;
  requestMod.ended = false;
  requestMod.cleared = false;
  requestMod.lockShutdown();

  const cleanup = () => {
    if(finished) return;
    finished = true;
    requestMod.ended = true;
    requestMod.unlockShutdown();
    request.removeListener('aborted', onAborted);
    response.removeListener('close', onClose);
    response.removeListener('finish', cleanup);
    for(const listener of terminalListeners) listener();
    terminalListeners.clear();
    manualResponseListeners.clear();
    delete requestMod.config;
    delete requestMod.DAL;
    delete requestMod.mail;
    delete requestMod.log;
    Object.keys(processFunctions).forEach(key => delete requestMod[key]);
    requestMod.cleared = true;
  };
  const cancel = reason => {
    if(finished || terminating) return;
    terminating = true;
    controller.abort(reason);
    cleanup();
  };
  const onAborted = () => {
    if(terminating) cleanup();
    else cancel('disconnect');
  };
  const onClose = () => {
    if(!response.writableFinished && !terminating) cancel('disconnect');
    else cleanup();
  };
  request.on('aborted', onAborted);
  response.on('close', onClose);
  response.on('finish', cleanup);
  Object.defineProperty(requestMod, '_lifecycle', {value: {
    onTerminal(listener){
      if(finished) listener();
      else terminalListeners.add(listener);
      return () => terminalListeners.delete(listener);
    },
    onManualResponse(listener){
      if(requestMod.responseFree) listener();
      else if(!finished) manualResponseListeners.add(listener);
      return () => manualResponseListeners.delete(listener);
    },
    timeout(){
      if(finished || terminating || requestMod.responseFree) return;
      terminating = true;
      requestMod.ended = true;
      controller.abort('timeout');
      for(const listener of terminalListeners) listener();
      terminalListeners.clear();
      if(response.destroyed){
        cleanup();
      }
      else if(!response.headersSent){
        const body = JSON.stringify({error: 'TIMEOUT'});
        response.writeHead(408, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)});
        originalEnd.call(response, body);
      }
      else originalEnd.call(response);
    }
  }});

  response.end = function(...args){
    if(finished || terminating || response.writableEnded) return response;
    const result = originalEnd.apply(response, args);
    requestMod.ended = true;
    return result;
  };
  requestMod.getResponse = () => {
    if(!finished && !terminating){
      requestMod.responseFree = true;
      for(const listener of manualResponseListeners) listener();
      manualResponseListeners.clear();
    }
    return response;
  };
  requestMod.getRequest = () => request;

  // Capture services independently of the HTTP context, including its logger.
  const backgroundServices = {
    id: requestMod.id,
    config: requestMod.config,
    DAL: requestMod.DAL,
    mail: requestMod.mail,
    websocket: requestMod.websocket,
    log: processFunctions.modifyLog.call({id: requestMod.id}, global.logger()),
    helpers: processFunctions.helpers,
    langs: [...(requestMod.langs || [])]
  };
  for(const name of ['i18n', 'obtainI18n', 'getView', 'getViewSync', 'modifyLog', 'getMethodsInfo', 'lockBackground']){
    backgroundServices[name] = processFunctions[name];
  }
  requestMod.getBackgroundContext = () => ({...backgroundServices, langs: [...backgroundServices.langs]});

  requestMod.end = (text='', code=200, headers={'content-type': 'text/html; charset=utf-8'}, type='text')=>{
    if(finished || terminating || response.destroyed || response.writableEnded) return;
    if(response.headersSent){
      response.end();
      return;
    }
    headers = Object.keys(headers).reduce((r, key)=>{
      r[key.toLowerCase()] = headers[key];
      return r;
    }, {});

    if(type == 'bin'){
      text = Buffer.from(text, 'binary');
      headers['content-length'] = text.length;
    }
    else{
      let asObject = false;
      if(typeof text == 'object' && text instanceof Buffer != true && text !== null){
        try{
          text = JSON.stringify(text);
        }catch(e){
          //
        }
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

      if(requestMod.jsonpCallback){
        const value = headers['content-type'] === 'application/json' || asObject ? text : JSON.stringify(String(text));
        text = `${requestMod.jsonpCallback}(${value});`;
        headers['content-type'] = 'application/javascript; charset=utf-8';
      }
      headers['content-length'] = Buffer.byteLength(text);
    }

    if(requestMod.config.defaultHeaders){
      for(let i in requestMod.config.defaultHeaders){  
        headers[i] = requestMod.config.defaultHeaders[i];
      }
    }

    if(requestMod.responseCookies){
      let cookies = headers['set-cookie'] || [];
      let expires = new Date();
      expires.setDate(expires.getDate() + 5);
      
      for(let i in requestMod.responseCookies){  
        cookies.push(i + '=' + encodeURIComponent(requestMod.responseCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
      }
      
      headers['set-cookie'] = cookies;
    }

    if(!text){
      code = 204;
    }

    response.writeHead(code, headers);
    if(type == 'bin') response.write(text, 'binary');
    else response.write(text);
    response.end();
  };

  if(request.aborted || (request.destroyed && !request.complete) || response.destroyed) cancel('disconnect');

  return modLog;
};

exports.getProcessFunctionsUtils = (processLocks, inits) => {
  const log = global.logger('_PROCESS-FUNCS');

  const lockTimers = new Map();
  const processFunctions = {
    lockShutdown(time){
      const id = this.id;
      const modLog = this.modifyLog(log);
      const duration = time || 10000;
      modLog.d('Shutdown locked by', id, 'for', duration, 'ms');
      clearTimeout(lockTimers.get(id));
      processLocks[id] = true;
      const timer = setTimeout(() => {
        if(lockTimers.get(id) !== timer) return;
        lockTimers.delete(id);
        delete processLocks[id];
        modLog.d('Shutdown unlocked for', id, 'by timeout');
      }, duration);
      lockTimers.set(id, timer);
    },
    unlockShutdown(ontimeout){
      clearTimeout(lockTimers.get(this.id));
      lockTimers.delete(this.id);
      if(!processLocks[this.id]) return;
      delete processLocks[this.id];
      const modLog = this.modifyLog(log);
      modLog.d('Shutdown unlocked for', this.id, 'by', (ontimeout ? 'timeout' : 'end'));
    },
    lockBackground(){
      const key = 'background:' + randomUUID();
      processLocks[key] = true;
      let released = false;
      return () => {
        if(released) return;
        released = true;
        delete processLocks[key];
      };
    },
    getProcessLocks(){
      return processLocks;
    },
    getMethodsInfo(showHidden){
      return inits.modules.info.map(m=>{
        m = Object.assign({}, m);
        m.methods = m.methods.filter(m=>{
          if(m.hidden && !showHidden){
            return false;
          }
          return true;
        });
        return m;
      }).filter(m=>{
        if(m.hidden && !showHidden || !m.methods || !m.methods.length){
          return false;
        }
        return true;
      });
    },
    i18n(key, def){
      for(let i in this.langs){
        if(inits.i18n[this.langs[i]] && inits.i18n[this.langs[i]][key]){
          return inits.i18n[this.langs[i]][key];
        }
      }

      return def || key;
    },
    obtainI18n(){
      return inits.i18n;
    },
    addCookies(key, val){
      this.responseCookies[key] = val;
    },
    rmCookies(key){
      this.responseCookies[key] = '';
    },
    error(text){
      if(!this.end) return;

      const modLog = this.modifyLog(log);
      modLog.e(text);
      if(this.config.useHttpErrorFiles){
        return this.getView('502.html', (err, data, headers)=>{
          if(err){
            this.end(
              this.i18n('Service Unavailable. Try again another time.'),
              503,
              {'Content-Type': 'text/plain; charset=utf-8'}
            );
          }
          else{
            this.end(data, 503, headers);
          }
        });
      }

      this.end(
        this.i18n('Service Unavailable. Try again another time.'),
        503,
        {'Content-Type': 'text/plain; charset=utf-8'}
      );
    },
    getView(view, file, cb){
      if(!cb && !file){
        throw 'minimum 2 arguments with last callback';
      }

      const modLog = this.modifyLog(log);

      if(!cb){
        cb = file;
        file = view;
        view = null;
      }

      file = decodeURIComponent(file);

      if(!this.config.views || !this.config.views.length) {
        return cb('NO config.views');
      }

      const contentType = exports.mime(file);

      const paths = this.config.views.map(path => join(path, file));
      const next = () => {
        if(!paths.length) return cb('Not found');
        const path = paths.shift();
        readFile(path, {encoding: 'utf8'}, (err, data) => {
          if(err) return next();
          cb(null, data, {'Content-Type': contentType});
        });
      };
      next();
    },
    getViewSync(view, file){
      if(!file){
        file = view;
      }

      if(!this.config.views || !this.config.views.length) {
        return 'NO config.views';
      }

      return this.config.views.reduce((res, view)=>{
        if(res){
          return res;
        }
        try{
          if(!statSync(join(view, file)).isFile()){
            return res;
          }
        }catch(e){
          return res;
        }
        try{
          return readFileSync(join(view, file), {encoding: 'utf8'});
        }
        catch(e){
          return res;
        }
      }, '').toString() || null;
    },
    modifyLog(originalLog){
      if(!originalLog){
        throw 'You must specify log instance by define it in varible with global.logger.create("MODULE_IDENTITY")';
      }

      return Object.keys(originalLog).reduce((res, color)=>{
        color = color.toLowerCase();
        if(color == 'add'){
          res[color] = originalLog[color];
          return res;
        }

        if(originalLog[color].modifed){
          throw 'Do not call modifyLog twice at one log';
        }

        res[color] = (...args)=>{
          originalLog[color].call({extra: '[rID:' + this.id + ']'}, ...args);
        };
        res[color].modifed = true;
        return res;
      }, {});
    },
    getFile(file, cb){
      const contentType = exports.mime(file);
      try{
        if(!statSync(file).isFile()){
          return cb('NOT FILE');
        }
      }catch(e){
        return cb('NO FILE', null);
      }

      readFile(file, (err, res)=>{
        if(err){
          return cb('BAD FILE', null, {err: err});
        }

        cb(null, res, {'Content-Type': contentType});
      });
    }
  };
  processFunctions.addCookie = processFunctions.addCookies;
  processFunctions.setCookie = processFunctions.addCookies;
  processFunctions.setCookies = processFunctions.addCookies;
  processFunctions.rmCookie = processFunctions.rmCookies;
  processFunctions.delCookie = processFunctions.rmCookies;
  processFunctions.delCookies = processFunctions.rmCookies;
  processFunctions.helpers = {
    generateId: exports.generateId,
    mime: exports.mime,
    toJson(res){
      try{
        res.data = JSON.stringify(res.data);
        res.headers['Content-Type'] = 'application/json';
      }catch(e){
        log.e('toJson.JSON.stringify error', e, 'on obj', res);
      }
    },
    clearObj(obj, toRemove){
      if(!obj) return '{}';

      try{
        const clonedObject = typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
        if(Array.isArray(toRemove)){
          for(let i in toRemove){
            delete clonedObject[toRemove[i]];
          }
        }
        return JSON.stringify(clonedObject);
      }catch(e){
        log.e('clearObj.JSON.stringify error', e, 'on obj', obj);
        return '';
      }
    },
    isBoolean(val){
      if(String(val).toLowerCase().match(/^(true|false)$/)){
        return true;
      }
      
      return false;
    },
    JSV(params, schema, envId){
      return JSV.createEnvironment(envId).validate(params, schema);
    }
  };
  return processFunctions;
};

exports.processInitsUtils = (inits, config, websocket, processFunctions) => {
  const { inits: modulesInits } = inits.modules;
  const { inits: middlewaresInits} = inits.middlewares;
  const allInits = [...Object.entries(modulesInits), ...Object.entries(middlewaresInits)];
  
  let context = {
    url: '',
    headers: {},
    DAL: inits.dal,
    mail: inits.mail,
    config,
    websocket
  };

  Object.keys(processFunctions).forEach(k=>{
    context[k] = processFunctions[k];
  });

  for(const [ii, init] of allInits){
    try{
      init(context, function(){});
    }catch(e){
      console.error('__init()', ii, e);
    }
  }
};

exports.startWatchUtils = (log, config, onChange) => {
  [].concat(
    config.modules, 
    config.dals, 
    config.middleware, 
    config.i18n, 
    config.emailSenders
  ).forEach(watchDir.bind(this, log, onChange));
};

function watchDir(log, onChange, path) {
  log.i('[WATCH] start watch catalog - ', path);

  watch(path, (type, file) => {
    if(!file || file.indexOf('.log') != -1) return;

    if(file.indexOf('.') == -1 ||
      file.indexOf('.swx') != -1 || file.indexOf('.swp') != -1 ||
      file.indexOf('.js~') != -1 || file.indexOf('.git') != -1){
      return;
    }

    log.i('[WATCH] File', file, 'was changed');
    onChange();
  });

  const files = readdirSync(path);

  for(const file of files){
    const filePath = join(path, file);
    if(file == 'node_modules' || file == '.git' || file == 'logs') {
      continue;
    }

    stat(filePath, (err, stat)=>{
      if(err){
        log.e('[WATCH]', err);
        return;
      }

      if(stat.isDirectory()){
        watchDir(log, onChange, filePath);
      }
    });
  }
}

exports.mime = function(file, fallback){
  return mimeTypes[extname(file).toLowerCase()] || fallback || 'application/octet-stream';
};

// List of most common mime-types, stolen from Rack.
const mimeTypes = { 
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