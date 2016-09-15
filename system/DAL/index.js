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
	let pathsToCheck = [__dirname].concat(paths.dals||[]).reverse();
	for(let dal of config.useDals){
		for(let dalsPath of pathsToCheck){
			let dalName = dal + '.js';
			try{
				if(fs.statSync(path.join(dalsPath, dalName)).isFile()){
					let dalFile = require(path.join(dalsPath, dalName));
					if(!dalFile.methods){
						throw 'exports.methods no defined';
					}
					if(dalFile.init){
						dalFile.init(config);
					}
					DALs[dal] = dalFile.methods;
					break;
				}
			}catch(e){
				log.e('Error in', path.join(dalsPath, dalName), e);
			}
		}
	}
	return DALs;
};