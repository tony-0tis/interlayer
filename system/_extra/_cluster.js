let cluster = require('cluster');
let path = require('path');
let helper = require('./index.js');

module.exports = clusterObject = {
  servers: [],
  log: {},
  inited: false,
  paths: [],
  config: {},
  start: (paths, config)=>{
    clusterObject.log = helper.logger(config.logPath, config.debug, config.pingponglog).create('CLUSTER');
  
    let toStart = config.workers || 1;
    if(toStart == 1 && !config.restartOnChange){
      helper.server.start(paths, config);
      return;
    }

    if(cluster.isMaster){
      clusterObject._init(paths, config);
      for(let i = toStart; i > 0; i--){
        clusterObject.add(i);
      }

      clusterObject.log.i('Start cluster with', clusterObject.size(), 'servers');
      
      if(config.restartOnChange){
        let st;
        clusterObject.startWatch(paths, config, ()=>{
          clearTimeout(st);
          st = setTimeout(()=>{
            clusterObject.log.i('Many files changed, restart');
            clusterObject.restart();
          }, 1500);
        });
      }
    }
  },
  _init: (paths, config)=>{
    clusterObject.inited = true;
    clusterObject.paths = paths || [];
    clusterObject.config = config || {};

    process.on('exit', ()=>{
      if(clusterObject.exitProcess){
        process.exit();
        return;
      }

      clusterObject.log.i('exit event', process.exitCode);
      clusterObject.exit();
    });
    process.on('SIGINT', ()=>{
      clusterObject.log.i('SIGINT event', process.exitCode);
      clusterObject.exit();
    });
    process.on('SIGTERM', ()=>{
      clusterObject.log.i('SIGTERM event', process.exitCode);
      clusterObject.exit();
    });
    process.on('message', msg=>{
      if(msg == 'shutdown'){
        clusterObject.log.i('process message shutdown');
        clusterObject.exit();
      }
    });
  },
  add: (i)=>{
    if(!clusterObject.inited){
      throw 'Not inited';
    }

    cluster.setupMaster({
      exec: path.join(__dirname, '/_server.js'),
      silent: true
    });

    let pings = [];

    let server = cluster.fork(process.env);
    server.on('online', ()=>{
      server.send({
        type: 'start',
        paths: clusterObject.paths,
        config: clusterObject.config
      });
    });
    server.on('error', error=>{
      if(error && String(error).indexOf('channel closed') > -1){
        return;
      }

      let pid = ((server||{}).process||{}).pid;
      clusterObject.log.e('server', pid, 'error', error);
    });
    server.on('exit', (code, sig)=>{
      if(server.exitFlag || code == 1){
        clusterObject.log.i('worker', (server && server.process || {}).pid, 'killed at end');
        server = null;
        clusterObject.rem(i);
        return;
      }

      clusterObject.log.w('worker', (server && server.process || {}).pid, 'down with code:', code, 'signal:', sig, 'respawn!');

      server = null;
      clusterObject.rem(i);
      clusterObject.add(i);
    });
    server.on('message', obj=>{
      switch(obj.type){
      case 'log':
        clusterObject.log.add(obj.log);
        break;
      case 'ping':
        server.send({
          type: 'pong',
          id: obj.id
        });
        clusterObject.log.pp('cluster obtain ping');
        clusterObject.log.pp('cluster send pong');
        break;
      case 'pong':
        let ind = pings.indexOf(obj.id);
        if(ind > -1){
          pings.splice(ind, 1);
        }
        clusterObject.log.pp('cluster obtain pong');
        break;
      default: 
        clusterObject.log.e('wrong message type', obj);
      }
      obj = null;
    });

    clusterObject.intervals.add((deleteInterval)=>{
      if(pings.length > 10){
        clusterObject.log.w('Pings length more that 10', server.process.pid);
        pings = [];
        deleteInterval();
        server.kill();
        
        setInterval(()=>{
          if(server){
            server.kill('SIGKILL');
          }
        }, clusterObject.config.instantShutdownDelay || 2000);
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
      clusterObject.log.pp('cluster send ping');
    });

    clusterObject.log.i('start worker process', server.process.pid);
    clusterObject.servers.push({n: i, srv: server});
  },
  rem: n=>{
    if(!clusterObject.inited){
      throw 'Not inited';
    }

    let toDel;
    for(let i = clusterObject.servers.length - 1; i >= 0; i--){
      if(clusterObject.servers[i].n == n){
        toDel = i;
        break;
      }
    }

    if(toDel != undefined){
      clusterObject.servers.splice(toDel, 1);
    }
  },
  size: () => clusterObject.servers.length,
  startWatch: (paths, config, cbRestart)=>{
    let pathsToWatch = [].concat(paths.modules, paths.dals, paths.middleware, paths.i18n);
    pathsToWatch.forEach(function watchDir(pth){
      clusterObject.log.i('start watch - ', pth);
      fs.watch(pth, (type, chFile)=>{
        if(!chFile || chFile.indexOf('.log') != -1){
          return;
        }

        if(chFile.indexOf('.') == -1 ||
          chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
          chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
          return;
        }

        clusterObject.log.i('File', chFile, 'was changed');
        cbRestart();
      });

      fs.readdir(pth, (e, f)=>{
        if(e){
          clusterObject.log.e(e);
          return;
        }

        f.forEach(f=>{
          if(f == 'node_modules' || f == '.git' || f == 'logs'){
            return;
          }

          fs.stat(path.join(pth, f), (e, s)=>{
            if(e){
              clusterObject.log.e(e);
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
    si: setInterval(()=>{
      if(!clusterObject)
      for(let i in clusterObject.intervals.funcs){
        if(!clusterObject.intervals.funcs.hasOwnProperty(i)){
          continue;
        }

        clusterObject.intervals.funcs[i].f(()=>{
          clusterObject.intervals.del(clusterObject.intervals.funcs[i].key);
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
  restart: ()=>{
    if(!clusterObject.inited){
      throw 'Not inited';
    }

    clusterObject.log.d('Command restart servers');
    for(let i = clusterObject.servers.length - 1; i >= 0; i--){
      clusterObject.servers[i].srv.send({type: 'reload'});
    }
  },
  exit: ()=>{
    if(!clusterObject.inited){
      throw 'Not inited';
    }

    if(clusterObject.exitProcess){
      return;
    }

    clusterObject.exitProcess = true;

    clusterObject.log.d('Command exit servers');
    for(let i = clusterObject.servers.length - 1; i >= 0; i--){
      clusterObject.servers[i].srv.exitFlag = true;
      clusterObject.servers[i].srv.send({type: 'exit'});
    }

    let si = setInterval(()=>{
      if(!clusterObject.servers.length){
        process.exit();
        clearInterval(si);
      }
    }, 50);
  }
};