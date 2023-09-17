const pg = require('pg');

const log = global.logger('_POSTGRESQL');

let DAL = {
  connect: cb => cb('NO_CONNECTION')
};

exports.init = (config, dalConfig) => {
  const conf = {
    host: '127.0.0.1',
    user: 'root'
  };

  for(let i in dalConfig){
    conf[i] = dalConfig[i];
  }

  if(!conf.database){
    throw 'wrong postgres config, check database';
  }

  DAL = new pg.Pool(conf);
  DAL.on('error', (err/*, client*/)=>{
    log.e('idle client error', err.message, err.stack);
  });
};

exports.methods = {};
for(let name in pg.prototype){
  if(name.indexOf('_') == 0){
    continue;
  }

  wrapMethod(name);
}

function wrapMethod(name){
  exports.methods[name] = (...args) => {
    let doneConn;
    let originalCb = ()=>{};
    const cb = (...callbackArgs) => {
      doneConn && doneConn();

      originalCb(...callbackArgs);
    };

    if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
      originalCb = args[args.length -1];
      args[args.length -1] = cb;
    }

    DAL.connect((err, connection, done) => {
      doneConn = done;
      
      if(err){
        return cb(err);
      }

      connection[name](...args);
    });
  };
}