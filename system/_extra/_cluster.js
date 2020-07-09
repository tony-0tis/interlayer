let cluster = require('cluster');
let path = require('path');
let fs = require('fs');
let helper = require('./index.js');

let log;
module.exports = {
  _servers: [],
  _inited: false,
  config: {},

  start(config){
    log = helper.logger(config.logPath, config.debug).create('CLUSTER');
  
    let toStart = config.workers || 1;
    if(toStart == 1 && !config.restartOnChange){
      helper.server.start(config);
      return;
    }

    if(cluster.isMaster){
      this._init(config);

      for(let i = toStart; i > 0; i--){
        this._addServer(i);
      }

      log.i('Start cluster with', this.size(), '_servers');
      
      if(config.restartOnChange){
        let st;
        this._startWatch(config, ()=>{
          clearTimeout(st);
          st = setTimeout(()=>{
            log.i('Many files changed, restart');
            this._restartServers();
          }, 1500);
        });
      }
    }
  },
  size(){
    return this._servers.length;
  },
  _init(config){
    this._inited = true;
    this.config = config || {};

    process.on('exit', ()=>{
      if(this.exitProcess){
        process._stopCusterAndExit();
        return;
      }

      log.i('exit event', process.exitCode);
      this._stopCusterAndExit();
    });
    process.on('SIGINT', ()=>{
      log.i('SIGINT event', process.exitCode);
      this._stopCusterAndExit();
    });
    process.on('SIGTERM', ()=>{
      log.i('SIGTERM event', process.exitCode);
      this._stopCusterAndExit();
    });
    process.on('message', msg=>{
      if(msg == 'shutdown'){
        log.i('process message shutdown');
        this._stopCusterAndExit();
      }
    });
  },
  _addServer(i){
    if(!this._inited) throw 'Not inited';

    cluster.setupMaster({
      exec: path.join(__dirname, '/../index.js'),
      silent: true
    });

    let pings = [];

    let server = cluster.fork(process.env);
    server.on('online', ()=>{
      server.send({
        type: 'start',
        config: this.config
      });
    });
    server.on('error', error=>{
      if(error && String(error).indexOf('channel closed') > -1){
        return;
      }

      let pid = ((server||{}).process||{}).pid;
      log.e('server', pid, 'error', error);
    });
    server.on('exit', (code, sig)=>{
      if(server.exitFlag || code == 1){
        log.i('worker', (server && server.process || {}).pid, 'killed at end');
        server = null;
        this._removeServer(i);
        return;
      }

      log.w('worker', (server && server.process || {}).pid, 'down with code:', code, 'signal:', sig, 'respawn!');

      server = null;
      this._removeServer(i);
      this._addServer(i);
    });
    server.on('message', obj=>{
      switch(obj.type){
      case 'log':
        log.add(obj.log);
        break;
      case 'ping':
        server.send({
          type: 'pong',
          id: obj.id
        });
        if(helper.config.pingponglog){
          log.d('cluster obtain ping');
          log.d('cluster send pong');
        }
        break;
      case 'pong':
        let ind = pings.indexOf(obj.id);
        if(ind > -1){
          pings.splice(ind, 1);
        }
        if(helper.config.pingponglog){
          log.d('cluster obtain pong');
        }
        break;
      default: 
        log.e('wrong message type', obj);
      }
      obj = null;
    });

    global.intervals.add(stopInterval=>{
      if(!server){
        stopInterval();
        return;
      }

      if(pings.length > 10){
        log.w('Pings length more that 10', server.process.pid);
        pings = [];
        stopInterval();
        server.kill();
        
        global.intervals.add(stopInt=>{
          if(server) server.kill('SIGKILL');
          else{
            stopInt();
          }
        }, this.config.instantShutdownDelay || 2000);
        return;
      }

      let ping = {
        type: 'ping',
        id: Date.now()
      };
      pings.push(ping.id);
      server.send(ping);
      if(helper.config.pingponglog){
        log.d('cluster send ping');
      }
    }, 1000);

    log.i('start worker process', server.process.pid);
    this._servers.push({n: i, srv: server});
  },
  _removeServer(n){
    if(!this._inited) throw 'Not inited';

    let toDel;
    for(let i = this._servers.length - 1; i >= 0; i--){
      if(this._servers[i].n == n){
        toDel = i;
        break;
      }
    }

    if(toDel != undefined){
      this._servers.splice(toDel, 1);
    }
  },
  _restartServers(){
    if(!this._inited) throw 'Not inited';

    log.d('Command restart _servers');
    for(let i = this._servers.length - 1; i >= 0; i--){
      this._servers[i].srv.send({type: 'reload'});
    }
  },
  _stopCusterAndExit(){
    if(!this._inited) throw 'Not inited';

    if(this.exitProcess) return;

    this.exitProcess = true;

    log.d('Stop cluster and process exit');
    for(let i = this._servers.length - 1; i >= 0; i--){
      this._servers[i].srv.exitFlag = true;
      this._servers[i].srv.send({type: 'exit'});
    }

    let si = setInterval(()=>{
      if(!this._servers.length){
        process.exit();
        clearInterval(si);
      }
    }, 50);
  },
  _startWatch(config, onChange){
    let pathsToWatch = [].concat(config.modules, config.dals, config.middleware, config.i18n, config.emailSenders);
    pathsToWatch.forEach(this._watchDir.bind(this, onChange));
  },
  _watchDir(onChange, pth){
    log.i('start watch catalog - ', pth);
    fs.watch(pth, (type, chFile)=>{
      if(!chFile || chFile.indexOf('.log') != -1) return;

      if(chFile.indexOf('.') == -1 ||
        chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
        chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
        return;
      }

      log.i('File', chFile, 'was changed');
      onChange();
    });

    fs.readdir(pth, (e, f)=>{
      if(e){
        log.e(e);
        return;
      }

      f.forEach(f=>{
        if(f == 'node_modules' || f == '.git' || f == 'logs') return;

        fs.stat(path.join(pth, f), (e, s)=>{
          if(e){
            log.e(e);
            return;
          }

          if(s.isDirectory()){
            this._watchDir.call(this, onChange, path.join(pth, f));
          }
        });
      });
    });
  }
};