const { statSync, readFile, readFileSync } = require('fs');
const { join } = require('path');
const { JSV } = require('JSV');

const { mime, generateId } = require('./utils.js');

exports.init = (processLocks, inits) => {
  const log = global.logger('_PROCESS-FUNCS');

  const processFunctions = {
    lockShutdown(time){
      const modLog = this.modifyLog(log);
      modLog.d('Shutdown locked by', this.id, 'for', (time||10000), 'ms');
      
      processLocks[this.id] = true;
      
      setTimeout(()=>{
        if(this.cleared){
          return;
        }
        this.unlockShutdown(true);
      }, (time||10000));
    },
    unlockShutdown(ontimeout){
      if(!processLocks[this.id]){
        return;
      }

      delete processLocks[this.id];

      const modLog = this.modifyLog(log);
      modLog.d('Shutdown unlocked for', this.id, 'by', (ontimeout ? 'timeout' : 'end'));
    },
    getProcessLocks(){
      return processLocks;
    },
    getMethodsInfo(showHidden){
      return inits.modules.info.map(m=>{
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

      const contentType = mime(file);

      const tries = [];
      for(let i in this.config.views){
        tries.push(
          new Promise((ok,fail)=>{
            try{
              if(!statSync(join(this.config.views[i], file)).isFile()){
                modLog.d('Not file', join(this.config.views[i], file));
                return fail();
              }
            }catch(e){
              modLog.d('bad stat', join(this.config.views[i], file), e);
              return fail(e);
            }

            readFile(join(this.config.views[i], file), {encoding: 'utf8'}, (err, res)=>{
              if(err){
                modLog.d('read err', join(this.config.views[i], file), err);
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
          modLog.e(err);
          cb('Not found');
        });
    },
    getViewSync(view, file){
      if(!file){
        file = view;
      }

      if(!this.config.views || !this.config.views.length) {
        return 'NO config.views';
      }

      return this.config.views.requce((res, view)=>{
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
      const contentType = mime(file);
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
    generateId,
    mime,
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