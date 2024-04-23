const cluster = require('cluster');
const { join } = require('path');

const { startWatch } = require('./utils.js');

let clasterObject;

exports.initCluster = config => {
  const log = global.logger('_CLUSTER');

  if(cluster.isWorker){
    return log.i('Cluster must be started in master');
  }

  clasterObject = new iCluster(log, config);
};

exports.stopCluster = () => {
  if(clasterObject){
    clasterObject.stopCusterAndExit();
  }
};

exports.isWorker = cluster.isWorker;

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

    if(typeof cluster.setupPrimary === 'function'){
      cluster.setupPrimary({
        exec: join(__dirname, '../index.js'),
      });
    }
    else{
      cluster.setupMaster({
        exec: join(__dirname, '../index.js'),
      });
    }

    const toStart = config.workers || 1;
    for(let i = toStart; i > 0; i--){
      cluster.fork(process.env);
    }

    this.#log.i('Start cluster with', this.#servers.length, 'servers');

    cluster.on('online', worker => {
      worker.send({
        type: 'startServerInWorker',
        config: this.#config
      });
    });

    cluster.on('exit', (worker, code, sig) => {
      if(!this.#clusterStopped){
        this.#log.w('worker', worker.process.pid, 'down with code:', code, 'signal:', sig, 'respawn!');
        cluster.fork(process.env);
      }
    });

    if(config.restartOnChange){
      let si;
      startWatch(this.#log, config, ()=>{
        clearTimeout(si);
        si = setTimeout(()=>{
          this.#log.i('Many files changed, restart');

          const workers = Object.values(cluster.workers);
          for(const worker of workers){
            worker.kill();
          }
        }, 1500);
      });
    }
  }

  stopCusterAndExit(){
    if(!this.#inited) throw 'Cluster not inited ' + new Error().stack;

    if(this.#clusterStopped) return;
    this.#clusterStopped = true;

    this.#log.d('Stop cluster and process exit');

    const workers = Object.values(cluster.workers);
    for(const worker of workers){
      worker.send({type: 'clusterStopped'});
    }

    const si = setInterval(()=>{
      const workers = Object.values(cluster.workers);
      if(!workers.workers.length){
        process.exit();
        clearInterval(si);
      }
    }, 50);
  }
}