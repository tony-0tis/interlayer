"use strict";

let path = require('path');
let fs = require('fs');

module.exports = class Server{
	/*#modules = [];dals = [];*///waiting for private
	constructor () {
		this.paths = {
			modules: [],
			dals: [],
			views: []
		};
	}
	addModulesPath (...args) {
		this.paths.modules = this.paths.modules.concat(args);
	}
	addDalsPath (...args) {
		this.paths.dals = this.paths.dals.concat(args);
	}
	addViewPath (...args) {
		this.paths.views = this.paths.views.concat(args);
	}
	init (config={}){
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
		if(!config.logPath){
			config.logPath = startPath;
		}

		// Modules
		if(config.modules && !Array.isArray(config.modules)){
			throw 'config.modules must be Array';
		}
		if(config.modules){
			this.paths.modules = this.paths.modules.concat(config.modules);
			delete config.modules;
		}
		if(!this.paths.modules.length){
			this.paths.modules.push(path.join(startPath, 'modules'));
		}
		this.paths.modules = this.paths.modules.reduce((res, mpath) => {
			if(!path.isAbsolute(mpath)){
				mpath = path.join(startPath, mpath);
			}
			try{
				if(fs.statSync(mpath).isDirectory()){
					res.push(mpath);
				}
				else{
					console.log('modules path', mpath, 'is not directory');
				}
			}catch(e){
				console.log('modules path', mpath, 'not created');
			}
			return res;
		}, []);
		if(!this.paths.modules.length){
			throw 'you must specify the path to the modules in config.modules, type - Array of strings';
		}

		// Dals
		if(config.dals && !Array.isArray(config.dals)){
			throw 'config.dals must be Array';
		}
		if(config.dals){
			this.paths.dals = this.paths.dals.concat(config.dals);
			delete config.dals;
		}
		this.paths.dals = this.paths.dals.reduce((res, dpath) => {
			if(!path.isAbsolute(dpath)){
				dpath = path.join(startPath, dpath);
			}
			try{
				if(fs.statSync(dpath).isDirectory()){
					res.push(dpath);
				}
				else{
					console.log('dals path', dpath, 'is not directory');
				}
			}
			catch(e){
				console.log('dals path', dpath, 'not created');
			}
			return res;
		}, []);
		if(!config.useDals || !config.useDals.length){
			if(!config.skipDbWarning){
				console.log('config.useDals not defined, no one database will be included');
			}
		}
		
		// Views
		if(config.views && !Array.isArray(config.views)){
			throw 'config.views must be Array';
		}
		if(config.views){
			this.paths.views = this.paths.views.concat(config.views);
			delete config.views;
		}
		this.paths.views = this.paths.views.reduce((res, vpath) => {
			if(!path.isAbsolute(vpath)){
				vpath = path.join(startPath, vpath);
			}
			try{
				if(fs.statSync(vpath).isDirectory()){
					res.push(vpath);
				}
				else{
					console.log('views path', vpath, 'is not directory');
				}
			}
			catch(e){
				console.log('views path', vpath, 'not created');
			}
			return res;
		}, []);
		
		this.paths.startPath = startPath;
		let cluster = require(path.join(__dirname, 'system/cluster'));
		process.chdir(startPath);
		cluster.start(this.paths, config);
	}
}
