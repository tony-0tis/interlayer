let fs = require('fs');
let path = require('path');
let cluster = require('cluster');
let logger = require('./logger.js');
let server = require('./server.js');

module.exports = function(config = {}){
  let paths = {};
  let serverPath = path.dirname(new Error().stack.split('\n').splice(2, 1)[0].match(/at[^(]*\(([^)]+)\)/)[1]);

  if(typeof config == 'string'){
    try{
      if(!path.isAbsolute(config)){
        config = path.join(serverPath, config);
      }

      config = JSON.parse(fs.readFileSync(config));
    }catch(e){
      config = {};
      throw 'wrong config file' + e;
    }
  }
  
  if(config.path){
    if(!path.isAbsolute(config.path)){
      throw 'config.path must be absolute path';
    }

    try{
      if(!fs.statSync(config.path).isDirectory()){
        throw 'config.path must be directory';
      }

      serverPath = config.path;
    }
    catch(e){
      throw config.path + 'is not created: ' + e;
    }
  }

  paths.serverPath = serverPath;

  if(!config.logPath){
    config.logPath = serverPath;
  }
  else if(!path.isAbsolute(config.logPath)){
    config.logPath = path.join(serverPath, config.logPath);
  }

  // Modules
  checkPath(paths, serverPath, config, 'modules', 'modules');
  
  // Views
  checkPath(paths, serverPath, config, 'views', 'files');

  // I18n
  checkPath(paths, serverPath, config, 'i18n', 'i18n');

  // Dals
  checkPath(paths, serverPath, config, 'dals');
  if(!config.useDals || !Object.keys(config.useDals).length){
    if(!config.skipDbWarning){
      console.log('config.useDals not defined, no one database will be included');
    }
  }

  // Middleware
  checkPath(paths, serverPath, config, 'middleware');

  // Email
  checkPath(paths, serverPath, config, 'emailSenders');

  // Serve
  checkPath(paths, serverPath, config, 'serve');
  
  process.chdir(serverPath);

  return clusters.start(paths, config);
};

function checkPath(paths, serverPath, config, type, def){
  if(config[type] && !Array.isArray(config[type])){
    throw 'config.' + type + ' must be Array';
  }

  paths[type] = paths[type] || [];

  if(config[type]){
    paths[type] = paths[type].concat(config[type]);
    delete config[type];
  }

  if(!paths[type].length && def){
    paths[type].push(path.join(serverPath, def));
  }

  paths[type] = paths[type].reduce((res, mpath) => {
    if(!path.isAbsolute(mpath)){
      mpath = path.join(serverPath, mpath);
    }

    try{
      if(fs.statSync(mpath).isDirectory()){
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
}

let clusters = {
  servers: [],
  log: {},
  start: (paths, config)=>{
    clusters.log = logger.logger(config.logPath, config.debug, config.pingponglog).create('CLUSTER');
  
    let toStart = config.workers || 1;
    if(toStart == 1 && !config.restartOnChange){
      server.start(paths, config);
      return;
    }

    if(cluster.isMaster){
      clusters.init(paths, config);
      for(let i = toStart; i > 0; i--){
        clusters.add(i);
      }

      clusters.log.i('Start cluster with', clusters.size(), 'servers');
      
      if(config.restartOnChange){
        let st;
        clusters.startWatch(paths, config, () => {
          clearTimeout(st);
          st = setTimeout(() => {
            clusters.log.i('Many files changed, restart');
            clusters.restart();
          }, 1500);
        });
      }
    }
  },
  init: (paths, config) => {
    clusters.paths = paths || [];
    clusters.config = config || {};
    clusters.inited = true;

    process.on('exit', () => {
      if(clusters.exitProcess){
        process.exit();
        return;
      }

      clusters.log.i('exit event', process.exitCode);
      clusters.exit();
    });
    process.on('SIGINT', () => {
      clusters.log.i('SIGINT event', process.exitCode);
      clusters.exit();
    });
    process.on('SIGTERM', () => {
      clusters.log.i('SIGTERM event', process.exitCode);
      clusters.exit();
    });
    process.on('message', msg=>{
      if (msg == 'shutdown') {
        clusters.log.i('process message shutdown');
        clusters.exit();
      }
    });
  },
  add: (i) => {
    if(!clusters.inited){
      throw 'Not inited';
    }

    cluster.setupMaster({
      exec: path.join(__dirname, '/server.js'),
      silent: true
    });

    let pings = [];

    let server = cluster.fork(process.env);
    server.on('online', () => {
      server.send({
        type: 'start',
        paths: clusters.paths,
        config: clusters.config
      });
    });
    server.on('error', error => {
      if(error && String(error).indexOf('channel closed') > -1){
        return;
      }

      let pid = ((server||{}).process||{}).pid;
      clusters.log.e('server', pid, 'error', error);
    });
    server.on('exit', (code, sig) => {
      if(server.exitFlag && code == 1){
        clusters.log.i('worker', (server && server.process || {}).pid, 'killed');
        server = null;
        clusters.rem(i);
        return;
      }

      clusters.log.w('worker', (server && server.process || {}).pid, 'down with code:', code, 'signal:', sig);

      server = null;
      clusters.rem(i);
      clusters.add(i);
    });
    server.on('message', obj => {
      switch(obj.type){
      case 'log':
        clusters.log.add(obj.log);
        break;
      case 'ping':
        server.send({
          type: 'pong',
          id: obj.id
        });
        clusters.log.pp('cluster obtain ping');
        clusters.log.pp('cluster send pong');
        break;
      case 'pong':
        let ind = pings.indexOf(obj.id);
        if(ind > -1){
          pings.splice(ind, 1);
        }
        clusters.log.pp('cluster obtain pong');
        break;
      default: 
        clusters.log.e('wrong message type', obj);
      }
      obj = null;
    });

    clusters.intervals.add((deleteInterval) => {
      if(pings.length > 10){
        deleteInterval();
        server.kill();
        return;
      }

      if(!server){
        deleteInterval();
        return;
      }

      let ping = {
        type: 'ping',
        id: Date.now()
      };
      pings.push(ping.id);
      server.send(ping);
      clusters.log.pp('cluster send ping');
    });

    clusters.log.i('start worker process', server.process.pid);
    clusters.servers.push({n: i, srv: server});
  },
  rem: n => {
    if(!clusters.inited){
      throw 'Not inited';
    }

    let toDel;
    for(let i = clusters.servers.length - 1; i >= 0; i--){
      if(clusters.servers[i].n == n){
        toDel = i;
        break;
      }
    }

    if(toDel != undefined){
      clusters.servers.splice(toDel, 1);
    }
  },
  size: () => clusters.servers.length,
  startWatch: (paths, config, cbRestart) => {
    let pathsToWatch = [].concat(paths.modules, paths.dals, paths.middleware, paths.i18n);
    pathsToWatch.forEach(function watchDir(pth){
      clusters.log.i('start watch - ', pth);
      fs.watch(pth, (type, chFile) => {
        if(!chFile || chFile.indexOf('.log') != -1){
          return;
        }

        if(chFile.indexOf('.') == -1 ||
          chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
          chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
          return;
        }

        clusters.log.i('File', chFile, 'was changed');
        cbRestart();
      });

      fs.readdir(pth, (e, f) => {
        if(e){
          clusters.log.e(e);
          return;
        }

        f.forEach(f => {
          if(f == 'node_modules' || f == '.git' || f == 'logs'){
            return;
          }

          fs.stat(path.join(pth, f), (e, s) => {
            if(e){
              clusters.log.e(e);
              return;
            }

            if(s.isDirectory()){
              watchDir(path.join(pth, f));
            }
          });
        });
      });
    });
  },
  intervals: {
    si: setInterval(() => {
      for(let i in clusters.intervals.funcs){
        if(!clusters.intervals.funcs.hasOwnProperty(i)){
          continue;
        }

        clusters.intervals.funcs[i].f(() => {
          clusters.intervals.del(clusters.intervals.funcs[i].key);
        });
      }
    }, 1000),
    funcs: [],
    add: function(f){
      let key = Math.random() * Date.now();
      this.funcs.push({key: key, f: f});
      return key;
    },
    del: function(key){
      let ind = this.funcs.reduce((r,f,ind)=>{
        if(f.key == key){
          r = ind;
        }
        return r;
      }, -1);
      this.funcs.splice(ind, 1);
    }
  },
  restart: () => {
    if(!clusters.inited){
      throw 'Not inited';
    }

    clusters.log.d('Command restart servers');
    for(let i = clusters.servers.length - 1; i >= 0; i--){
      clusters.servers[i].srv.send({type: 'reload'});
    }
  },
  exit: () => {
    if(!clusters.inited){
      throw 'Not inited';
    }

    if(clusters.exitProcess){
      return;
    }

    clusters.exitProcess = true;

    clusters.log.d('Command exit servers');
    for(let i = clusters.servers.length - 1; i >= 0; i--){
      clusters.servers[i].srv.exitFlag = true;
      clusters.servers[i].srv.send({type: 'exit'});
    }

    let si = setInterval(()=>{
      if(!clusters.servers.length){
        process.exit();
        clearInterval(si);
      }
    }, 50);
  }
};