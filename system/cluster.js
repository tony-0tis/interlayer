const { isWorker, setupPrimary, setupMaster, fork } = require('cluster');
const { join } = require('path');

const { startWatch } = require('./utils.js');

let cluster = null;

exports.initCluster = config => {
  const log = global.logger('_CLUSTER');

  if(isWorker){
    return log.i('Cluster must be started in master');
  }

  cluster = new iCluster(log, config);
};

exports.stopCluster = () => {
  if(cluster){
    cluster.stopCusterAndExit();
  }
};

exports.isWorker = isWorker;

class iCluster {
  #config = {};
  #inited = false;
  #clusterStopped = false;
  #servers = [];
  #log = null;

  constructor(log, config){
    this.#log = log;
    this.#config = config || this.#config;

    this.#inited = true;

    if(typeof setupPrimary === 'function'){
      setupPrimary({
        exec: join(__dirname, '../index.js'),
      });
    }
    else{
      setupMaster({
        exec: join(__dirname, '../index.js'),
      });
    }

    const toStart = config.workers || 1;
    for(let i = toStart; i > 0; i--){
      this.#addServer(i);
    }

    this.#log.i('Start cluster with', this.#servers.length, 'servers');

    if(config.restartOnChange){
      let si;
      startWatch(this.#log, config, ()=>{
        clearTimeout(si);
        si = setTimeout(()=>{
          this.#log.i('Many files changed, restart');
          this.#restartServers();
        }, 1500);
      });
    }
  }

  #addServer(i){
    if(!this.#inited) throw 'Not inited';

    let server = fork(process.env);
    server.on('online', () => {
      server.send({
        type: 'startServerInWorker',
        config: this.#config
      });
    });
    server.on('error', error => {
      if(error && String(error).indexOf('channel closed') > -1){
        return;
      }

      this.#log.e('server', ((server||{}).process||{}).pid, 'error', error);
    });
    server.on('exit', (code, sig) => {
      if(server.exitFlag || code == 1){
        this.#log.i('worker', (server && server.process || {}).pid, 'killed at end');
        server = null;
        this.#removeServer(i);
        return;
      }

      this.#log.w('worker', (server && server.process || {}).pid, 'down with code:', code, 'signal:', sig, 'respawn!');

      server = null;
      this.#removeServer(i);
      this.#addServer(i);
    });

    this.#log.i('start worker process', server.process.pid);
    this.#servers.push({n: i, srv: server});
  }

  #removeServer(n){
    if(!this.#inited) throw 'Not inited';

    let toDel;
    for(let i = this.#servers.length - 1; i >= 0; i--){
      if(this.#servers[i].n == n){
        toDel = i;
        break;
      }
    }

    if(toDel != undefined){
      this.#servers.splice(toDel, 1);
    }
  }

  #restartServers(){
    if(!this._inited) throw 'Not inited';

    this.#log.d('Command restart servers');
    for(let i = this.#servers.length - 1; i >= 0; i--){
      this.#servers[i].srv.send({type: 'reloadWorker'});
    }
  }

  stopCusterAndExit(){
    if(!this.#inited) throw 'Not inited';

    if(this.#clusterStopped) return;

    this.#clusterStopped = true;

    this.#log.d('Stop cluster and process exit');
    for(const server of this.#servers){
      server.srv.exitFlag = true;

      server.srv.send({type: 'clusterStopped'});
    }

    const si = setInterval(()=>{
      if(!this.#servers.length){
        process.exit();
        clearInterval(si);
      }
    }, 50);
  }
}