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

// Pool.query releases its client for both callbacks and promises.
exports.methods = {};
for(const name of ['query', 'connect', 'end']){
  exports.methods[name] = (...args) => DAL[name](...args);
}
