"use strict"
let fs = require('fs');
let colors = {
	I: 32,
	E: 31,
	D: 36,
	W: 33,
	C: 37
};
let breaker = /^win/.test(process.platform) ? '' : '\n';
let streams = {};
exports.logger = dir => {
	//console.log(dir);

	let logFile;
	if(streams[dir]){
		logFile = streams[dir];
	}
	else{
		logFile = fs.createWriteStream(dir + '/logs.log');
	}

	let write = str => {
		try{
			logFile.write(str);
			// process.send && process.send({
			// 	type: 'logs',
			// 	mess: str
			// });
			console.log(str);
		}catch(e){
			console.error(e);
			console.log(str);
		}
	};

	let split = (obj, del) => {
		let str = [];
		del = del || " # ";
		
		for(let i in obj){
			if(!obj[i]){
				continue;
			}
			
			if(typeof obj[i] == 'object' && !obj[i].stack){
				obj[i] = JSON.stringify(obj[i], null, 2);
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

	return {
		create: name => {
			let log = {
				date: () => {
					let d = new Date();
					return '[' + d.getFullYear() + '/' + ND(d.getMonth() + 1) + '/' + ND(d.getDate()) +
						'|' + ND(d.getHours()) + ':' + ND(d.getMinutes()) + ':' + ND(d.getSeconds()) + 
						'.' + ND(d.getMilliseconds(), 3) + '|' + (d.getTimezoneOffset() / 60) + ']';
				},
				e: (...args) => {
					args = split(args);
					let str = log.date() + '[E][' + name + '] ' + args;
					str = '\x1b[37;' + colors.E + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
					//console.error.apply({}, args);
				},
				i: (...args) => {
					args = split(args);
					let str = log.date() + '[I][' + name + '] ' +  args;
					str = '\x1b[37;' + colors.I + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
					//console.log.apply({}, args);
				},
				w: (...args) => {
					args = split(args);
					let str = log.date() + '[W][' + name + '] ' + args;
					str = '\x1b[37;' + colors.W + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
				},
				d: (...args) => {
					args = split(args);
					let str = log.date() + '[D][' + name + '] ' + args;
					str = '\x1b[37;' + colors.D + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
				},
				c: (...args) => {
					args = split(args);
					let str = log.date() + '[C][' + name + '] ' + args;
					str = '\x1b[37;' + colors.C + ';1m' + str + '\x1b[0m' + breaker;
					write(str);
				},
				clear: () => {
					logFile.close();
					fs.writeFileSync(dir + '/logs.log', '');
					logFile = fs.createWriteStream(dir + '/logs.log');
				},
				nd: ND,
				split: split,
				write: write,
				sourceFile: logFile
			};
			return log;
		}
	};
};
