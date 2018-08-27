"use strict"
let fs = require('fs');
let until = require('util');
let path = require('path');
let colors = {
	I: 32,
	E: 31,
	D: 36,
	W: 33,
	C: 37
};

let breaker = /^win/.test(process.platform) ? '' : '\n';
let streams = {};
exports.logger = (dir, debug) => {
	//console.log(dir);

	let logFile;
	if(process.send){
		logFile = {
			write: (str) => {
				process.send({
					type: 'log',
					log: str
				});
			},
			close: () => {}
		};
	}
	else if(streams[dir]){
		logFile = streams[dir];
	}
	else{
		logFile = fs.createWriteStream(dir + '/logs.log');
	}

	let write = (str, toConsole) => {
		try{
			logFile.write(str);
			console.log(str);
		}catch(e){
			console.error(e);
			console.log(str);
		}
	};

	let split = (obj, del) => {
		let str = [];
		del = del || " ";
		
		for(let i in obj){
			if(!obj[i]){
				continue;
			}
			
			if(typeof obj[i] == 'object' && !obj[i].stack){
				try{
					obj[i] = until.inspect(obj[i]);
				}catch(e){
					//
				}
			}
			
			if(obj[i].stack){
				obj[i] = obj[i].stack;
			}
			
			str.push(obj[i]);
		}
		
		return str.join(del);
	};

	let ND = (num, l) => {
		num = String(num);
		l = l || 2;
		
		while(num.length < l){
			num = '0' + num;
		}
		
		return num;
	};

	let date = () => {
		let d = new Date();
		return '[' + d.getFullYear() + '/' + ND(d.getMonth() + 1) + '/' + ND(d.getDate()) +
			'|' + ND(d.getHours()) + ':' + ND(d.getMinutes()) + ':' + ND(d.getSeconds()) + 
			'.' + ND(d.getMilliseconds(), 3) + '|' + (d.getTimezoneOffset() / 60) + ']';
	};

	let getFileName = (stack, createPath, isModifed) => {
		let file = stack.split('\n');
		if(!file[2]){
			return '???';
		}

		let fPath = file[2].match(/.*\((.*):\d+:\d+\)/)[1];
		if(isModifed){
			fPath = file[3].match(/.*\((.*):\d+:\d+\)/)[1];
		}

		//return JSON.stringify([createPath, fPath])

		return path.relative(createPath, fPath).replace(/(\.\.[\\/])+/, '');
	};
	return {
		create: name => {
			name = typeof name == 'string' ? name : '';
			let createPath = !name ? new Error().stack.split('\n')[2].match(/.*\((.*):\d+:\d+\)/)[1] : '';
			let log = {
				add: str => write(str)
			};

			for(let i in colors){
				if(!colors.hasOwnProperty(i)){
					continue;
				}

				log[i.toLowerCase()] = function(...args){
					if(!name){
						name = getFileName(new Error().stack, createPath, this.logModifed);
					}

					if(i == 'D' && !debug){
						return;
					}

					args = split(args);
					let str = date() + '[' + i + '][' + process.pid + '][' + name + '] ' + args;
					str = '\x1b[37;' + colors[i] + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
				}
			}
			
			return log;
		}
	};
};
