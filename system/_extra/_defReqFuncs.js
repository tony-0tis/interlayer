let fs = require('fs');
let path = require('path');
let log = global.logger.create('_DEF-FUNCS');
let helpers = require('./index.js');

let processLocks = {};
let defaultRequestFuncs = {
  lockShutdown: function(time){
    let nLog = this.modifyLog(log);
    nLog.d('Shutdown locked by', this.id, 'for', (time||10000), 'ms');
    
    processLocks[this.id] = true;
    
    setTimeout(()=>{
      if(this.cleared){
        return;
      }
      this.unlockShutdown(true);
    }, (time||10000));
  },
  unlockShutdown: function(ontimeout){
    if(!processLocks[this.id]){
      return;
    }

    let nLog = this.modifyLog(log);
    nLog.d('Shutdown unlocked for', this.id, 'by', (ontimeout ? 'timeout' : 'end'));
    delete processLocks[this.id];
  },
  getProcessLocks(){
    return processLocks;
  },
  getMethodsInfo: (showHidden)=>{
    return helpers.infoApi.map(m=>{
      m = Object.assign(m);
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
  i18n: function(key, def){
    for(let i in this.langs){
      if(helpers.i18n[this.langs[i]] && helpers.i18n[this.langs[i]][key]){
        return helpers.i18n[this.langs[i]][key];
      }
    }

    return def || key;
  },
  obtainI18n: function(){
    return helpers.i18n;
  },
  addCookies: function(key, val){
    this.responseCookies[key] = val;
  },
  rmCookies: function(key){
    this.responseCookies[key] = '';
  },
  error: function(text){
    if(!this.end) return;
    let nLog = this.modifyLog(log);
    nLog.e(text);
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
  getView: function(view, file, cb){
    if(!cb && !file){
      throw 'minimum 2 arguments with last callback';
    }

    let nLog = this.modifyLog(log);

    if(!cb){
      cb = file;
      file = view;
      view = null;
    }

    file = decodeURIComponent(file);

    if(!this.config.views || !this.config.views.length) return cb('NO config.views');

    let contentType = helpers.mime(file);

    let tries = [];
    for(let i in this.config.views){
      if(!this.config.views.hasOwnProperty(i)){
        continue;
      }

      tries.push(
        new Promise((ok,fail)=>{
          try{
            if(!fs.statSync(path.join(this.config.views[i], file)).isFile()){
              nLog.d('Not file', path.join(this.config.views[i], file));
              return fail();
            }
          }catch(e){
            nLog.d('bad stat', path.join(this.config.views[i], file), e);
            return fail(e);
          }

          fs.readFile(path.join(this.config.views[i], file), {encoding: 'utf8'}, (err, res)=>{
            if(err){
              nLog.d('read err', path.join(this.config.views[i], file), err);
              return fail(err);
            }

            return ok(res);
          });
        })
      );
    }
    Promise.race(tries)
      .then(result => cb(null, (result||'').toString(), {'Content-Type': contentType}))
      .catch(err=>{
        nLog.e(err);
        cb('Not found');
      });
  },
  getViewSync: function(view, file){
    if(!file){
      file = view;
    }

    if(!this.config.views || !this.config.views.length) return cb('NO config.views');

    return this.config.views.requce((res, view)=>{
      if(res){
        return res;
      }
      try{
        if(!fs.statSync(path.join(view, file)).isFile()){
          return res;
        }
      }catch(e){
        return res;
      }
      try{
        return fs.readFileSync(path.join(view, file), {encoding: 'utf8'});
      }
      catch(e){
        return res;
      }
    }, '').toString() || null;
  },
  modifyLog: function(originalLog){
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
  getFile: function(file, cb){
    let contentType = helpers.mime(file);
    try{
      if(!fs.statSync(file).isFile()){
        return cb('NOT FILE');
      }
    }catch(e){
      return cb('NO FILE', null);
    }

    fs.readFile(file, (err, res)=>{
      if(err){
        return cb('BAD FILE', null, {err: err});
      }

      cb(null, res, {'Content-Type': contentType});
    });
  }
};
defaultRequestFuncs.addCookie = defaultRequestFuncs.addCookies;
defaultRequestFuncs.setCookie = defaultRequestFuncs.addCookies;
defaultRequestFuncs.setCookies = defaultRequestFuncs.addCookies;
defaultRequestFuncs.rmCookie = defaultRequestFuncs.rmCookies;
defaultRequestFuncs.delCookie = defaultRequestFuncs.rmCookies;
defaultRequestFuncs.delCookies = defaultRequestFuncs.rmCookies;
defaultRequestFuncs.helpers = {
  generateId: helpers.generateId,
  toJson: helpers.toJson,
  clearObj: helpers.clearObj,
  isBoolean: helpers.isBoolean,
  JSV: helpers.JSV,
  mime: helpers.mime
};
module.exports = defaultRequestFuncs;