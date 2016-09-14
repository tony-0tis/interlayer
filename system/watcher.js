"use strict";
let fs = require('fs');
let path = require('path');
let fork  = require('child_process').fork;

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