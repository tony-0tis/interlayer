"use strict"
let fs = require('fs');
let path = require('path');
let log = global.logger.create('DAL');
let async = require('async');

let DALs = {};
exports.init = (paths, config) => {
	if(!config.useDals){
		return;
	}
	let useDals = config.useDals;
	if(typeof config.useDals && !Array.isArray(config.useDals)){
		useDals = Object.keys(config.useDals);
	}
	let pathsToCheck = [__dirname].concat(paths.dals||[]).reverse();
	for(let dal of useDals){
		let dalName = dal + '.js';
		for(let dalsPath of pathsToCheck){
			try{
				if(fs.statSync(path.join(dalsPath, dalName)).isFile()){
					let dalFile = require(path.join(dalsPath, dalName));
					if(!dalFile.methods){
						throw 'exports.methods no defined';
					}
					if(dalFile.init){
						dalFile.init(config, config.useDals[dal]);
					}
					DALs[dal] = dalFile.methods;
					Object.freeze(DALs[dal]);
					break;
				}
			}catch(e){
				log.e('Error in', path.join(dalsPath, dalName), e);
			}
		}
	}

	log.d('DALs included', Object.keys(DALs));

	Object.freeze(DALs);

	return DALs;
};