"use strict";

let path = require('path');
let fs = require('fs');

let cluster = require(path.join(__dirname, 'cluster'));

module.exports = function(config = {}){
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

	let paths = {};

	// Modules
	checkPath.call(paths, startPath, config, 'modules', 'modules');

	// Dals
	checkPath.call(paths, startPath, config, 'dals');
	if(!config.useDals || !config.useDals.length){
		if(!config.skipDbWarning){
			console.log('config.useDals not defined, no one database will be included');
		}
	}

	// Middleware
	checkPath.call(paths, startPath, config, 'middleware');
	
	// Views
	checkPath.call(paths, startPath, config, 'views', 'files');

	// I18n
	checkPath.call(paths, startPath, config, 'i18n', 'i18n');

	// Email
	//checkPath.call(paths, startPath, config, 'emails');

	checkPath.call(paths, startPath, config, 'serve');
	
	paths.startPath = startPath;
	process.chdir(startPath);

	return cluster.start(paths, config);
};

function checkPath(startPath, config, type, def){
	// Modules
	if(config[type] && !Array.isArray(config[type])){
		throw 'config.' + type + ' must be Array';
	}

	this[type] = this[type] || [];

	if(config[type]){
		this[type] = this[type].concat(config[type]);
		delete config[type];
	}

	if(!this[type].length && def){
		this[type].push(path.join(startPath, def));
	}

	this[type] = this[type].reduce((res, mpath) => {
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