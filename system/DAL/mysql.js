const { createPool } = require('mysql');
const connectionMethods = require('mysql/lib/Connection');

const log = global.logger('_MYSQL');

let DAL = {
  getConnection: cb => cb('NO_CONNECTION')
};

exports.init = (config, dalConfig)=>{
  const conf = {
    host: '127.0.0.1',
    user: 'root'
  };

  for(const i in dalConfig){
    conf[i] = dalConfig[i];
  }

  if(!conf.database){
    throw 'wrong mysql config, check database set';
  }

  DAL = createPool(conf);
};

exports.methods = {};
for(const name in connectionMethods.prototype){
  if(name.indexOf('_') == 0){
    continue;
  }

  if(['format', 'escapeId', 'escape'].indexOf(name) > -1){
    exports.methods[name] = (...args) => connectionMethods.prototype[name].call(DAL, ...args);
    continue;
  }

  wrapMethod(name);
}
function wrapMethod(name){
  exports.methods[name] = function(...args){
    let conn;
    let called = false;
    let originalCb = ()=>{};
    const cb = (...callbackArgs)=>{
      if(called) return;
      called = true;
      const connection = conn;
      conn = undefined;
      if(connection) connection.release();
      originalCb(...callbackArgs);
    };

    if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
      originalCb = args[args.length -1];
      args[args.length -1] = cb;
    }

    else{
      args.push(cb);
    }

    try{ DAL.getConnection((err, connection)=>{
      if(err){
        return cb(err);
      }

      conn = connection;
      
      try{
        const sql = connection[name](...args);
        if(this && this.showSql && sql) log.w(sql.sql);
      }catch(error){
        if(!conn) throw error; // A user callback threw after the connection was released.
        cb(error);
      }
    }); }catch(error){ if(called) throw error; cb(error); }
  };
}