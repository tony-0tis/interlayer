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
    let originalCb = ()=>{};
    const cb = (...callbackArgs)=>{
      if(conn){
        conn.release();
      }

      originalCb(...callbackArgs);
      conn = undefined;
    };

    if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
      originalCb = args[args.length -1];
      args[args.length -1] = cb;
    }

    DAL.getConnection((err, connection)=>{
      if(err){
        return cb(err);
      }

      conn = connection;
      
      const sql = connection[name](...args);
      if(this.showSql){
        log.w(sql.sql);
      }
    });
  };
}