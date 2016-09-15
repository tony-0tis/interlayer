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
		for(let i = clusters.servers - 1; i >= 0; i--){
			clusters.servers[i].srv.kill('SIGABRT');
		}
	},
	exit: () => {
		for(let i = clusters.servers - 1; i >= 0; i--){
			clusters.servers[i].srv.kill('SIGKILL');
		}
	}
};

let isWin = /^win/.test(process.platform);
let log;

exports.start = (paths, config) => {
	let logger = require('./logger.js').logger(config.logPath);
	log = logger.create('CLUSTER');
	
	let toStart = config.numOfServers || 1;
	if(toStart == 1 && !config.useWatcher || cluster.isWorker){
		let server = require('./server.js');
		server.start(paths, config);

		//for cluster.isWorker we do not using process.on('message'), cause cluster start server from server.init()
	}

	if(cluster.isWorker){
		let pings = [];
		process.on('message', obj=> {
			switch(obj.type){
				case 'ping':
					process.send({
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
			}
		});
		let si = setInterval(()=>{
			if(pings.length > 10){
				clearInterval(si);
				process.exit('SIGKILL');
				return;
			}
			let ping = {
				type: 'ping',
				id: Date.now()
			};
			pings.push(ping.id);
			process.send(ping);
		}, 1000);
	}
	else if(cluster.isMaster){
		for (let i = toStart; i > 0; i--){
			let init = () => {
				let server = cluster.fork(process.env);
				let pings = [];
				server.on('error', error => log.e('server error', error));
				server.on('exit', (code, sig) => {
					if(sig == 'SIGKILL'){
						log.i('worker', server.process.pid, 'killed');
						return;
					}

					log.e('worker', server.process.pid, 'down with code:', code, 'signal:', sig);

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
				});

				let si = setInterval(()=>{
					if(pings.length > 10){
						clearInterval(si);
						server.kill('SIGKILL');
						return;
					}
					let ping = {
						type: 'ping',
						id: Date.now()
					};
					pings.push(ping.id);
					server.send(ping);
				}, 1000);

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
	let pathsToWatch = [].concat(paths.modules, paths.dals || []);
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