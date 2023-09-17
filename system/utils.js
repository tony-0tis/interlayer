const { join, isAbsolute, dirname, extname } = require('path');
const { statSync, watch, readdirSync, stat } = require('fs');

exports.pathCheck = /[\w\d./]*/;

exports.getRootPath = error => {
  return dirname(error.stack.split('\n').splice(2, 1)[0].match(/at\s?[^(]*\(?([^)]+)\)?/)[1]);
};

exports.initLogger = config => {
  global.logger =  require('./logger.js')(config.logPath, config.debug, config.disableLogFile).create;
  global.logger.create = global.logger;
};

exports.checkPath = (serverPath, config, type, def) => {
  if(config[type] && !Array.isArray(config[type])){
    throw 'config.' + type + ' must be Array';
  }

  config[type] = config[type] || [];

  if(config[type]){
    config[type] = config[type].concat(config[type]);
  }

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

exports.getUrl = (moduleName, methodName, moduleObject, meta) => {
  if(moduleObject.addToRoot || meta.addToRoot){
    return methodName;
  }

  if(meta.path && meta.path.match(exports.pathCheck)){
    methodName = meta.path;
  }

  return moduleName + '/' + methodName;
};

exports.getModule = ({ modules }, moduleName) => {
  if(modules[moduleName]){
    return modules[moduleName];
  }

  moduleName = moduleName.replace(/\/$/, '').replace(/^\//, '');

  if(modules[moduleName]){
    return modules[moduleName];
  }

  let subs = moduleName.split('/');
  if(subs.length > 1){
    if(modules[subs[0] + '/*']){
      return modules[subs[0] + '/*'];
    }
  }

  return false;
};

exports.modifyRequest = (requestMod, request, response, processFunctions, log) => {
  for(let i in requestMod.params){
    if(processFunctions.helpers.isBoolean(requestMod.params[i])){
      requestMod.params[i] = Boolean(requestMod.params[i]);
    }
  }

  if(requestMod.params.callback){
    requestMod.jsonpCallback = requestMod.params.callback;
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


  let originalResposeEnd;
  requestMod.lockShutdown();

  requestMod.getResponse = ()=>{
    originalResposeEnd = response.end;
    response.end = function(...args){
      requestMod.unlockShutdown();
      if(!requestMod || requestMod.ended){
        if(requestMod){
          clearRequest();
        }

        requestMod = undefined;
        throw 'FORBIDEN';
      }

      requestMod.ended = true;
      response.end = originalResposeEnd;
      originalResposeEnd = undefined;
      response.end(...args);
      delete response.end;

      clearRequest();
    };

    requestMod.responseFree = true;
    return response;
  };

  requestMod.getRequest = ()=>request;

  requestMod.end = (text='', code=200, headers={'Content-Type': 'text/html; charset=utf-8'}, type='text')=>{
    requestMod.unlockShutdown();
    if(!requestMod || requestMod.ended){
      requestMod = undefined;
      clearRequest();
      return;
    }

    requestMod.ended = true;

    if(type == 'bin'){
      text = Buffer.from(text, 'binary');
      headers['Content-Length'] = text.length;
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

      headers['Content-Length'] = Buffer.from(text).length;

      if(requestMod.jsonpCallback){
        if(headers['Content-Type'] == 'application/json' || asObject){
          text = `${requestMod.jsonpCallback}(${text});`;
        }
        else{
          text = `${requestMod.jsonpCallback}("${text}");`;
        }
      }
    }

    if(requestMod.config.defaultHeaders){
      for(let i in requestMod.config.defaultHeaders){  
        headers[i] = requestMod.config.defaultHeaders[i];
      }
    }

    if(requestMod.responseCookies){
      let cookies = [];
      let expires = new Date();
      expires.setDate(expires.getDate() + 5);
      
      for(let i in requestMod.responseCookies){  
        cookies.push(i + '=' + encodeURIComponent(requestMod.responseCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
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

  let clearRequest = () => {
    if(requestMod){
      //objects
      delete requestMod.config;
      delete requestMod.DAL;
      delete requestMod.mail;
      delete requestMod.log;

      //current request functions
      delete requestMod.getResponse;
      delete requestMod.getRequest;
      delete requestMod.end;

      // default functions
      Object.keys(processFunctions).forEach(k=>{
        delete requestMod[k];
      });
      processFunctions = null;
    }

    if(originalResposeEnd){
      response.end = originalResposeEnd;
    }

    requestMod.cleared = true;

    originalResposeEnd = undefined;
    requestMod = undefined;
    clearRequest = undefined;
    request = undefined;
  };

  return requestMod.modifyLog(log);
};

exports.processInits = (inits, config, websocket, processFunctions) => {
  const { inits: modulesInits } = inits.modules;
  const { inits: middlewaresInits} = inits.middlewares;
  const allInits = {...modulesInits, ...middlewaresInits};
  
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

  for(let ii in allInits){
    try{
      allInits[ii](context, function(){});
    }catch(e){
      console.error('__init()', ii, e);
    }
  }
};

exports.startWatch = (log, config, onChange) => {
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