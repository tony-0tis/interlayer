"use strict";
let fs = require('fs');
let path = require('path');
let cluster = require('cluster');
let clusters = {
	servers: [],
	add: (n, srv) => {
		clusters.servers.push({n: n, srv: srv});
	},
	rem: n => {
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
		for(let i = clusters.servers.length - 1; i >= 0; i--){
			clusters.servers[i].srv.send({type: 'reload'});
		}
	},
	exit: () => {
		for(let i = clusters.servers.length - 1; i >= 0; i--){
			clusters.servers[i].srv.exitFlag = true;
			clusters.servers[i].srv.send({type: 'exit'});
		}
		clusters = null;
	}
};

let isWin = /^win/.test(process.platform);
let log;
let intervals = {
	si: setInterval(() => {
		for(let i in intervals.funcs){
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
}

exports.start = (paths, config) => {
	let logger = require('./logger.js').logger(config.logPath, config.debug);
	log = logger.create('CLUSTER');
	
	let toStart = config.numOfServers || 1;
	if(toStart == 1 && !config.useWatcher){
		let server = require('./server.js');
		server.start(paths, config);
		return;
	}

	if(cluster.isMaster){
		for (let i = toStart; i > 0; i--){
			let init = () => {
				cluster.setupMaster({
					exec: __dirname + '/server.js',
					silent: true
				});
				let server = cluster.fork(process.env);
				let pings = [];
				server.on('online', () => {
					server.send({
						type: 'start',
						paths: paths,
						config: config
					});
				});
				server.on('error', error => {
					if(error && String(error).indexOf('channel closed')){
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
					init();
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
				clusters.add(i, server);
			}
			init();
		}

		log.i('Start cluster with', clusters.size(), 'servers');
		
		if(config.useWatcher){
			let st;
			startWatch(paths, config, () => {
				clearTimeout(st);
				st = setTimeout(() => {
					log.i('Many files changed, restart');
					clusters.restart();
				}, 1500)
			})
		}
	}
}
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