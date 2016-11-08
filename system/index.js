"use strict";

let path = require('path');
let fs = require('fs');

let cluster = require(path.join(__dirname, 'cluster'));

let serverObj = {
	paths: {
		modules: [],
		dals: [],
		middleware: [],
		views: [],
		i18n: [],
		//emails: []
	},
	server: function(){
		this.addModulesPath = (...args) => {
			serverObj.paths.modules = serverObj.paths.modules.concat(args);
		};
		this.addDalsPath = (...args) => {
			serverObj.paths.dals = serverObj.paths.dals.concat(args);
		};
		this.addMiddleWarePath = (...args) => {
			serverObj.paths.middleware = serverObj.paths.middleware.concat(args);
		};
		this.addViewPath = (...args) => {
			serverObj.paths.views = serverObj.paths.views.concat(args);
		};
		this.addi18nPath = (...args) => {
			serverObj.paths.i18n = serverObj.paths.i18n.concat(args);
		};
		// this.addEmailSerdersPath = (...args) => {
		// 	serverObj.paths.emails = serverObj.paths.emails.concat(args);
		// },
		this.init = (config = {}) => {
			// Deprecated
			if(config.initDals && !config.useDals){
				console.log('please replace config.initDals to config.useDals. config.initDals is deprecated');
				config.useDals = config.initDals;
			}
			if(config.type){
				console.log('config.type is deprecated, use config.useWatcher=true instead config.type="watcher"');
				if(config.type == 'watcher'){
					config.useWatcher = true;
				}
			}

			// ####
			let startPath = path.dirname(new Error().stack.split('\n').splice(2, 1)[0].match(/at[^\(]*\(([^\)]+)\)/)[1]);
			if(config.startPath){
				if(!path.isAbsolute(config.startPath)){
					throw 'config.startPath must be absolute path';
				}
				try{
					if(!fs.statSync(config.startPath).isDirectory()){
						throw 'config.startPath must be directory';
					}
					startPath = config.startPath;
				}
				catch(e){
					throw 'config.startPath not created' + e;
				}
			}
			if(!config.logPath){
				config.logPath = startPath;
			}
			else if(!path.isAbsolute(config.logPath)){
				config.logPath = path.join(startPath, config.logPath);
			}

			// Modules
			checkPath.call(serverObj, startPath, config, 'modules', 'modules');
			if(!serverObj.paths.modules.length){
				throw 'you must specify the path to the modules in config.modules, type - Array of strings';
			}

			// Dals
			checkPath.call(serverObj, startPath, config, 'dals');
			if(!config.useDals && !config.useDals.length){
				if(!config.skipDbWarning){
					console.log('config.useDals not defined, no one database will be included');
				}
			}

			// Middleware
			checkPath.call(serverObj, startPath, config, 'middleware');
			
			// Views
			checkPath.call(serverObj, startPath, config, 'views', 'files');

			// I18n
			checkPath.call(serverObj, startPath, config, 'i18n', 'i18n');

			// Email
			//checkPath.call(serverObj, startPath, config, 'emails');
			
			serverObj.paths.startPath = startPath;
			process.chdir(startPath);
			cluster.start(serverObj.paths, config);
		};
	}
};

module.exports = serverObj.server;

function checkPath(startPath, config, type, def){
	// Modules
	if(config[type] && !Array.isArray(config[type])){
		throw 'config.' + type + ' must be Array';
	}

	if(config[type]){
		this.paths[type] = this.paths[type].concat(config[type]);
		delete config[type];
	}

	if(!this.paths[type].length && def){
		this.paths[type].push(path.join(startPath, def));
	}

	this.paths[type] = this.paths[type].reduce((res, mpath) => {
		if(!path.isAbsolute(mpath)){
			mpath = path.join(startPath, mpath);
		}
		try{
			if(fs.statSync(mpath).isDirectory()){
				if(res.indexOf(mpath) < 0){
					res.push(mpath);
				}
			}
			else{
				console.log(type, 'path', mpath, 'is not directory');
			}
		}catch(e){
			console.log(type, 'path', mpath, 'not created');
		}
		return res;
	}, []);
}