const { createClient } = require('redis');
const { default: commands } = require('@redis/client/dist/lib/client/commands');

const { generateId } = require('../utils.js');

const log = global.logger('_REDIS');

const retry_strategy = function(options){
  if(options.error && options.error.code === 'ECONNREFUSED'){
    // End reconnecting on a specific error and flush all commands with a individual error
    if(this.emit_error){
      this.emit_error('No connection');
    }

    return new Error('The server refused the connection');
  }

  if(options.total_retry_time > 1000 * 60 * 60){
    // End reconnecting after a specific timeout and flush all commands with a individual error
    if(this.emit_error){
      this.emit_error('No connection');
    }

    return new Error('Retry time exhausted');
  }

  if(options.times_connected > 10){
    // End reconnecting with built in error
    if(this.emit_error){
      this.emit_error('No connection');
    }

    return undefined;
  }

  // reconnect after
  return Math.max(options.attempt * 100, 3000);
};

const DAL = {
  connections: [],
  opened: [],
  getOrCreate: (mainCb) => {
    const lazy = lazyDefine.get();
    let cb = (err, client) => {
      cb = () => {};
      mainCb(err, client, lazy);
    };

    if(DAL.connections.length){
      let connection = DAL.connections.shift();
      connection.lastOpened = Date.now();
      DAL.opened.push(connection);
      DAL._checkConnections();
      log.d('connection', connection.id, 'opened');
      
      setImmediate(()=>{
        cb(null, connection.redis, lazy);
      });

      return lazy;
    }

    let connection = {
      id: generateId(),
      redis: {}
    };

    let config = {
      retry_strategy,
      legacyMode: true,
      emit_error: err => connection && connection.redis.emit('error', err)
    };

    if(DAL.config && DAL.config){
      for(let i in DAL.config){
        config[i] = DAL.config[i];
      }
    }
    
    try{ connection.redis = createClient(config); }
    catch(error){ setImmediate(() => cb(error)); return lazy; }
    connection.redis.on('error', err => {
      log.e('Error in redis exports.connection:', (connection && connection.id), err);
      
      if(!connection){
        return;
      }

      const broken = connection;
      connection = null;
      if(DAL._closeConnection(broken.id)){
        log.d('connection', broken.id, 'deleted from opened by error');
      }
      // A failed/closed client cannot reliably process a queued QUIT command.
      try{
        const closing = typeof broken.redis.disconnect === 'function' ? broken.redis.disconnect() : broken.redis.quit();
        if(closing && typeof closing.catch === 'function') closing.catch(() => {});
      }catch(error){
        // disconnect() can throw when the client is already closed.
      }

      return cb(err);
    });
    connection.redis.on('ready', () => {
      if(!connection){
        return cb('NO CONNECTION READY');
      }

      connection.lastOpened = Date.now();
      DAL.opened.push(connection);
      log.d('connection', connection.id, 'created and added to opened');

      return cb(null, connection.redis);
    });
    connection.redis.on('requestEnded', () => {
      if(!connection){
        return;
      }

      const conn = DAL._closeConnection(connection.id);
      if(!conn){
        return log.e('No opened id', connection.id);
      }

      DAL.connections.push(conn[0]);

      log.d('connection', connection.id, 'moved to waited');
    });
    connection.redis.on('end', () => {
      if(!connection){
        return;
      }

      let conn = DAL._closeConnection(connection.id);
      if(conn){
        conn = undefined;
        log.d('connection', connection.id, 'deleted from opened by end connection');
      }

      connection = undefined;

      return cb('No connection');
    });
    try{
      Promise.resolve(connection.redis.connect()).catch(err => {
        if(connection) connection.redis.emit('error', err);
      });
    }catch(error){
      setImmediate(() => { if(connection) connection.redis.emit('error', error); });
    }

    DAL._checkConnections();
    return lazy;
  },
  _checkConnections: () => {
    const expired = [];
    const keep = connection => {
      if(Date.now() - connection.lastOpened <= 14400000) return true;
      expired.push(connection);
      return false;
    };
    DAL.opened = DAL.opened.filter(keep);
    DAL.connections = DAL.connections.filter(keep);
    for(const connection of expired){
      try{
        const closing = typeof connection.redis.disconnect === 'function' ? connection.redis.disconnect() : connection.redis.quit();
        if(closing && typeof closing.catch === 'function') closing.catch(() => {});
      }catch(error){ log.d('expired connection already closed', connection.id); }
    }
  },
  _closeConnection: (id)=>{
    let sid;
    //let conn;
    for(let i in DAL.opened){
      if(DAL.opened[i].id == id){
        sid = i;
        break;
      }
    }

    if(sid){
      return DAL.opened.splice(sid, 1);
    }

    for(let i in DAL.connections){
      if(DAL.connections[i].id == id){
        sid = i;
        break;
      }
    }

    if(sid){
      return DAL.connections.splice(sid, 1);
    }
  }
};

const lazyDefine = {
  methods: {},
  get: ()=>Object.assign({}, lazyDefine.methods, {list: []})
};

exports.methods = {};
for(const name in commands){
  wrapMethod(name);
  if(!exports.methods[name.toLowerCase()]){
    wrapMethod(name.toLowerCase(), name);
  }
}

function wrapMethod(name, redissCommand){
  if(!redissCommand) redissCommand = name;

  exports.methods[name] = (...args) => DAL.getOrCreate((err, connection, lazy) => {
    const operations = [{cmd: redissCommand, args}, ...lazy.list];
    const rejectQueued = (pending, error) => {
      let thrown;
      for(const operation of pending){
        const callback = operation.args[operation.args.length - 1];
        if(typeof callback !== 'function') continue;
        try{ callback(error); }catch(failure){ if(!thrown) thrown = failure; }
      }
      if(thrown) throw thrown;
    };
    if(err){ rejectQueued(operations, err); return; }
    let index = 0;
    const run = () => {
      const operation = operations[index++];
      const params = [...operation.args];
      const callback = typeof params[params.length - 1] === 'function' ? params.pop() : () => {};
      let called = false;
      const onError = error => done(error);
      const onEnd = () => done(new Error('Redis connection closed'));
      const done = (...result) => {
        if(called) return;
        called = true;
        connection.removeListener('error', onError);
        connection.removeListener('end', onEnd);
        const failed = Boolean(result[0]);
        if(failed || index === operations.length) connection.emit('requestEnded');
        try{ callback(...result); }
        finally{
          if(failed) rejectQueued(operations.slice(index), result[0]);
          else if(index < operations.length) run();
        }
      };
      connection.once('error', onError);
      connection.once('end', onEnd);
      try{ connection[operation.cmd](...params, done); }
      catch(error){ if(called) throw error; done(error); }
    };
    run();
  });

  lazyDefine.methods[name] = function(...args){
    this.list.push({cmd: redissCommand, args});
    return this;
  };
}

exports.init = (config, dalConfig) =>{
  DAL.config = dalConfig;
};