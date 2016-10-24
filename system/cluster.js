"use strict";
let fs = require('fs');
let path = require('path');
let cluster = require('cluster');
let intervals = {
	si: setInterval(() => {
		for(let i in intervals.funcs){
			if(!intervals.funcs.hasOwnProperty(i)){
				continue;
			}
			intervals.funcs[i](() => {
				intervals.del(i);
			});
		}
	}, 1000),
	funcs: [],
	add: function(f){
		this.funcs.push(f);
	},
	del: function(ind){
		this.funcs.splice(ind, 1);
	}
};
let clusters = {
	servers: [],
	init: (paths, config) => {
		clusters.paths = paths || [];
		clusters.config = config || {};
		clusters.inited = true;
	},
	add: (i) => {
		if(!clusters.inited){
			throw 'Not inited';
		}

		cluster.setupMaster({
			exec: path.join(__dirname, '/server.js'),
			silent: true
		});
		let server = cluster.fork(process.env);
		let pings = [];
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
			log.e('server', pid, 'error', error)
		});
		server.on('exit', (code, sig) => {
			if(server.exitFlag && code == 1){
				log.i('worker', (server && server.process || {}).pid, 'killed');
				server = null;
				clusters.rem(i);
				return;
			}

			log.w('worker', (server && server.process || {}).pid, 'down with code:', code, 'signal:', sig);

			server = null;
			clusters.rem(i);
			clusters.add(i);
		});
		server.on('message', obj => {
			switch(obj.type){
				case 'log':
					log.add(obj.log);
				break;
				case 'ping':
					server.send({
						type: 'pong',
						id: obj.id
					});
				break;
				case 'pong':
					let ind = pings.indexOf(obj.id);
					if(ind > -1){
						pings.splice(ind, 1);
					}
				break;
				default: 
					log.e('wrong message type', obj);
			}
			obj = null;
		});

		intervals.add((deleteInterval) => {
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
		});

		log.i('start worker process', server.process.pid);
		clusters.servers.push({n: i, srv: server});
	},
	rem: n => {
		if(!clusters.inited){
			throw 'Not inited';
		}

		let toDel;
		for(let i = clusters.servers - 1; i >= 0; i--){
			if(clusters.servers[i].n == n){
				toDel = i;
				break
			}
		}

		if(toDel != undefined){
			clusters.servers.splice(toDel, 1);
		}
	},
	size: () => clusters.servers.length,
	restart: () => {
		if(!clusters.inited){
			throw 'Not inited';
		}

		log.d('Command restart servers');
		for(let i = clusters.servers.length - 1; i >= 0; i--){
			clusters.servers[i].srv.send({type: 'reload'});
		}
	},
	exit: () => {
		if(!clusters.inited){
			throw 'Not inited';
		}

		log.d('Command exit servers');
		for(let i = clusters.servers.length - 1; i >= 0; i--){
			clusters.servers[i].srv.exitFlag = true;
			clusters.servers[i].srv.send({type: 'exit'});
		}
		clusters = null;
	}
};

let log;
let logger = require('./logger.js');
let server = require('./server.js');

exports.start = (paths, config) => {
	log = logger.logger(config.logPath, config.debug).create('CLUSTER');
	
	let toStart = config.numOfServers || 1;
	if(toStart == 1 && !config.useWatcher){
		server.start(paths, config);
		return;
	}

	if(cluster.isMaster){
		clusters.init(paths, config)
		for (let i = toStart; i > 0; i--){
			clusters.add(i);
		}

		log.i('Start cluster with', clusters.size(), 'servers');
		
		if(config.useWatcher){
			let st;
			startWatch(paths, config, () => {
				clearTimeout(st);
				st = setTimeout(() => {
					log.i('Many files changed, restart');
					clusters.restart();
				}, 1500);
			});
		}
	}
};

process.on('exit', () => clusters.exit());

function startWatch(paths, config, cbRestart){
	let pathsToWatch = [].concat(paths.modules, paths.dals, paths.middleware, paths.i18n);
	pathsToWatch.forEach(function watchDir(pth){
		log.i('start watch - ', pth);
		fs.watch(pth, (type, chFile) => {
			if(!chFile || chFile.indexOf('.log') != -1){
				return;
			}

			if(chFile.indexOf('.') == -1 ||
				chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
				chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
				return;
			}

			log.i('File', chFile, 'was changed');
			cbRestart();
		});

		fs.readdir(pth, (e, f) => {
			if(e){
				log.e(e);
				return
			}

			f.forEach(f => {
				if(f == 'node_modules' || f == '.git' || f == 'logs'){
					return;
				}

				fs.stat(path.join(pth, f), (e, s) => {
					if(e){
						log.e(e);
						return;
					}

					if(s.isDirectory()){
						watchDir(path.join(pth, f));
					}
				});
			});
		});
	});
}