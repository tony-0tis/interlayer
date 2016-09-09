"use strict";
let fs = require('fs');
let path = require('path');
let spawn  = require('child_process').spawn;

let isWin = /^win/.test(process.platform);

let file = './index.js';

let logger = require('./logger.js').logger(dir);
let log = logger.create('MONITOR');

let procInitiator = () => {
	let proc;
	let killed = false;

	log.i('start file ', file, '; cur path', dir);
	let app = {
		initProc: () => {
			proc = spawn('node', [file], {
				cwd: dir,
				env: process.env
			});
			proc.stdout.on('data', data => {
				//console.log(data.toString());
			});
			proc.stderr.on('data', data => {
				//console.error(data.toString());
				process.stderr.write(data.toString() + '\n');
			});
			proc.on('exit', (code, sig) => {
				if(sig == 'SIGKILL' || sig == 'SIGABRT'){
					return;
				}

				log.e('spawned process down with code:', code, 'signal', sig);
				app.KILL('SIGKILL');
			});
			
			log.i('start spawn process', 'node', [file]);
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

						fs.stat(pth + '/' + f, (e, s) => {
							if(e){
								log.e(e);
							}

							if(s && s.isDirectory()){
								app.watchDir(pth + '/' + f);
							}
						});
					});
				}
			});
		}
	};

	return app;
};

exports.startWatch = (config) => {
	let file = config.file || './index.js'
	let dir = path.dirname(file);
	if(dir == '.'){
		dir = __dirname;
		file = dir + '/' + file;
	}
	if(fs.existsSync(file) === false){
		catch 'No file ' + file;
	}

	let proc = procInitiator();
	proc.watchDir(dir);
	proc.initProc();
};