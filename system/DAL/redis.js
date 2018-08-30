let redis = require('redis');
let log = global.logger.create('REDIS');
let helpers = require('../helpers');
let soother = () => {};

let retry_strategy = function(options){
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

let DAL = {
  connections: [],
  opened: [],
  getOrCreate: (mainCb) => {
    let lazy = lazyDefine.get();
    let cb = (...args) => {
      args.push(lazy);
      mainCb(...args);
      cb = soother;
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
      id: helpers.generateId(),
      redis: {}
    };

    let config = {
      retry_strategy: retry_strategy,
      emit_error: err => connection && connection.redis.emit('error', err)
    };

    if(DAL.config && DAL.config){
      for(let i in DAL.config){
        if(!DAL.config.hasOwnProperty(i)){
          continue;
        }

        config[i] = DAL.config[i];
      }
    }
    
    connection.redis = redis.createClient(config);
    connection.redis.on('error', err => {
      log.e('Error in redis exports.connection:', connection.id, err);
      if(!connection){
        return;
      }

      connection.redis.quit();

      let conn = DAL._closeConnection(connection.id);
      if(conn){
        conn = undefined;
        log.d('connection', connection.id, 'deleted from opened by error');
      }

      connection = null;

      return cb(err);
    });
    connection.redis.on('ready', () =>{
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

      let conn = DAL._closeConnection(connection.id);
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

    DAL._checkConnections();
    return lazy;
  },
  _checkConnections: () => {
    DAL.opened = DAL.opened.reduce((res, conn) =>{
      if(Date.now() - conn.lastOpened > 14400000){
        conn.redis.quit();
        delete conn.redis;
        conn = null;
      }
      else{
        res.push(conn);
      }

      return res;
    }, []);

    DAL.connections = DAL.connections.reduce((res, conn) => {
      if(Date.now() - conn.lastOpened > 14400000){
        conn.redis.quit();
        delete conn.redis;
        conn = null;
      }
      else{
        res.push(conn);
      }
      return res;
    }, []);
  },
  _closeConnection: (id) => {
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

exports.init = (config, dalConfig) =>{
  DAL.config = dalConfig;
};

let lazyDefine = {
  methods: {},
  get: ()=>Object.assign({}, lazyDefine.methods, {list: []})
};

exports.methods = {};
for(let name in redis.RedisClient.prototype){// eslint-disable-line guard-for-in
  wrapMethod(name);
}

function wrapMethod(name){
  exports.methods[name] = (...args) => {
    let conn;
    let originalCb = soother;
    let cb = (...resargs) => {
      if(conn){
        conn.emit('requestEnded');
      }

      originalCb(...resargs);
      conn = undefined;
    };
    
    if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
      originalCb = args[args.length -1];
      args[args.length -1] = cb;
    }
    else{
      args.push(cb);
    }

    return DAL.getOrCreate((err, connection, lazy) => {
      if(err){
        return cb(err);
      }

      conn = connection;
      if(lazy && !lazy.list.length){
        return connection[name](...args);
      }
      else{
        lazy.list.unshift({cmd: name, args: args});
        let res = conn;
        
        lazy.list.map(i=>{
          res = res[i.cmd](...i.args);
        });
        
        setTimeout(cb, 2000);
      }
    });
  };
  
  lazyDefine.methods[name] = function(...args){
    this.list.push({cmd: name, args: args});
    return this;
  };
}
