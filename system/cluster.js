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

let procInitiator = (dir, file, paths, config) => {
	let proc;
	let killed = false;

	log.i('init watcher for dir', dir);
	let app = {
		initProc: () => {
			proc = fork(file, ['fromChecker'], {
				cwd: dir,
				env: process.env
			});
			proc.on('message', (obj) => {
				switch(obj.type){
					case 'logs':
						console.log(obj.mess.toString());
				}
			});
			proc.on('error', error => {
				log.e('Error while execute:', error);
			});
			proc.on('exit', (code, sig) => {
				if(sig == 'SIGKILL' || sig == 'SIGABRT'){
					return;
				}

				log.e('forked process down with code:', code, 'signal', sig);
				app.KILL('SIGKILL');
			});
			proc.send({
				type: 'start',
				paths: paths,
				config: config
			});
			
			log.i('start fork process', 'node', [file]);
			killed = false;
		},
		checkAndKill: (type, chFile) => {
			if(!chFile || chFile.indexOf('.log') != -1){
				return;
			}

			if(killed === true || chFile.indexOf('.') == -1 ||
				chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
				chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
				return;
			}

			log.i(type, chFile, 1);

			killed = true;
			log.i('File', file, 'was changed, restart');
			app.KILL('SIGABRT');
		},
		EXIT: () => {
			log.i('kill process and exit');
			proc.kill('SIGKILL');
			killed = true;
		},
		KILL: signal => {
			log.i('kill process with signal', signal);
			proc.kill(isWin ? 'SIGKILL' : signal);
			killed = true;

			setTimeout(function(){
				app.initProc();
			}, 500);
		},
		watchDir: pth => {
			log.i('start watch - ', pth);
			fs.watch(pth, app.checkAndKill);

			fs.readdir(pth, (e, f) => {
				if(e){
					log.e(e);
				}

				if(f && f.length > 0){
					f.forEach(f => {
						if(f == 'node_modules' || f == '.git' || f == 'logs'){
							return;
						}

						fs.stat(path.join(pth, f), (e, s) => {
							if(e){
								log.e(e);
							}

							if(s && s.isDirectory()){
								app.watchDir(path.join(pth, f));
							}
						});
					});
				}
			});
		}
	};
	process.on('exit', () => {
		log.w('Exit and kill');
		app.EXIT();
	});

	return app;
};

exports.start = (paths, config) => {
	let file = path.join(__dirname, 'server.js');
	if(fs.existsSync(file) === false){
		throw 'No file ' + file;
	}

	let logger = require('./logger.js').logger(config.logPath);
	log = logger.create('MONITOR');

	let proc = procInitiator(paths.startPath, file, paths, config);
	proc.watchDir(paths.startPath);
	proc.initProc();
};

exports.start = (paths, config) => {
	let logger = require('./logger.js').logger(config.logPath);
	log = logger.create('CLUSTER');
	
	let toStart = config.numOfServers || 1;
	if(toStart == 1 && !config.useWatcher|| cluster.isWorker){
		let server = require('./server.js');
		server.start(paths, config);
	}
	else if(cluster.isMaster){
		for (let i = toStart; i > 0; i--){
			let init = () => {
				let server = cluster.fork(process.env);
				server.on('error', error => log.e('server error', error));
				server.on('exit', (code, sig) => {
					if(sig == 'SIGKILL'){
						return;
					}

					log.e('worker', server.process.pid, 'down with code:', code, 'signal:', sig);

					server = null;
					clusters.rem(i);
					init();
				});

				log.i('start worker process', server.process.pid);
				clusters.add(i, server);
			}
			init();
		}

		log.i('Start cluster with', clusters.size(), 'servers');
		
		if(config.useWatcher){
			startWatch(paths, config, () => {
				clusters.restart();
			})
		}
	}
}
process.on('exit', () => clusters.exit());

function startWatch(cbRestart){
	log.i('start watch - ', pth);
	fs.watch(pth, (type, chFile) => {
		if(!chFile || chFile.indexOf('.log') != -1){
			return;
		}

		if(killed === true || chFile.indexOf('.') == -1 ||
			chFile.indexOf('.swx') != -1 || chFile.indexOf('.swp') != -1 ||
			chFile.indexOf('.js~') != -1 || chFile.indexOf('.git') != -1){
			return;
		}

		log.i(type, chFile, 1);

		killed = true;
		log.i('File', file, 'was changed, restart');
		cbRestart();
	});

	fs.readdir(pth, (e, f) => {
		if(e){
			log.e(e);
		}

		if(f && f.length > 0){
			f.forEach(f => {
				if(f == 'node_modules' || f == '.git' || f == 'logs'){
					return;
				}

				fs.stat(path.join(pth, f), (e, s) => {
					if(e){
						log.e(e);
					}

					if(s && s.isDirectory()){
						app.watchDir(path.join(pth, f));
					}
				});
			});
		}
	});
}