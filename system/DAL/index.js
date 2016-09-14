"use strict"
let fs = require('fs');
let path = require('path');
let log = global.logger.create('DAL');
let async = require('async');

let DALs = {};
exports.init = (paths, config) => {
	if(!config.initDals){
		return;
	}
	let pathsToCheck = [__dirname].concat(paths.dals||[]).reverse();
	for(let dal of config.initDals){
		for(let dalsPath of pathsToCheck){
			if(fs.statAsync(path.join(dalsPath, dal)).isFile()){
				try{
					let dalFile = require(path.join(dalsPath, dal));
					if(!dalFile.methods){
						throw 'exports.methods no defined';
					}
					if(dalFile.init){
						dalFile.init(config);
					}
					DALs[dal] = dalFile.methods;
					break;
				}catch(e){
					log.e('Error in', path.join(dalsPath, dal), e);
				}
			}
		}
	}
};