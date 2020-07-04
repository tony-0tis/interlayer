let fs = require('fs');
let log = global.logger.create('_DEF-FUNCS');
let helpers = require('./index.js');

let processLocks = {};
let defaultRequestFuncs = {
  lockShutdown: function(time){
    log.d('Shutdown locked by', this.id, 'for', (time||10000), 'ms');
    
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

    log.d('Shutdown unlocked for', this.id, 'by', (ontimeout ? 'timeout' : 'end'));
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

    return def;
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
    this.end(
      this.i18n('service.503', 'Service Unavailable. Try again another time.') + (this.config.debug ? ' (' + text + ')' : ''),
      503,
      {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    );
  },
  getView: function(view, file, cb){
    if(!cb && !file){
      throw 'minimum 2 arguments with last callback';
    }
    if(!cb){
      cb = file;
      file = view;
      view = null;
    }
    let tries = [];
    for(let i in this.config.view){
      if(!this.config.view.hasOwnProperty(i)){
        continue;
      }
      tries.push(
        new Promise((ok,fail)=>{
          try{
            if(!fs.statSync(path.join(this.config.view[i], file)).isFile()){
              log.d('Not file', path.join(this.config.view[i], file));
              return fail();
            }
          }catch(e){
            log.d('bad stat', path.join(this.config.view[i], file), e);
            return fail(e);
          }

          fs.readFile(path.join(this.config.view[i], file), (err, res)=>{
            if(err){
              log.d('read err', path.join(this.config.view[i], file), err);
              return fail(err);
            }
            return ok(res);
          });
        })
      );
    }
    Promise.race(tries)
      .then(result => cb(null, (result||'').toString()))
      .catch(err=>{
        log.e(err);
        cb('Not found');
      });
  },
  getViewSync: function(view, file){
    if(!file){
      file = view;
    }
    return this.config.view.requce((res, view)=>{
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
        return fs.readFileSync(path.join(view, file));
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

      res[color] = ((original)=>{
        return (...args)=>{
          args.unshift('[rID:' + this.id + ']');
          original.apply({logModifed: true}, args);
        };
      })(originalLog[color]);
      res[color].modifed = true;
      return res;
    }, {});
  },
  getFile: function(file, cb){
    let contentType = helpers.mime(file);
    try{
      if(!fs.statSync(file).isFile()){
        return cb('NOt FILE');
      }
    }catch(e){
      return cb('NO FILE', null, {err: e});
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