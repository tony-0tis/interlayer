let log = global.logger.create('MYSQL');
let mysql = require('mysql');
let connectionMethods = require('mysql/lib/Connection')

let DAL = {
	getConnection: cb => cb('NO_CONNECTION')
}
exports.init = (config, dalConfig) => {
	let conf = {
		host: '127.0.0.1',
		user: 'root'
	};
	for(let i in dalConfig){
		if(!dalConfig.hasOwnProperty(i)){
			continue;
		}
		conf[i] = dalConfig[i];
	}
	if(!conf.database){
		throw 'wrong mysql config, check database';
	}
	DAL = mysql.createPool(conf);
};

exports.methods = {};
for(let name in connectionMethods.prototype){
	if(name.indexOf('_') == 0){
		continue;
	}

	wrapMethod(name);
}
function wrapMethod(name){
	exports.methods[name] = (...args) => {
		let conn;
		let originalCb = () => {};
		let cb = (...resargs) => {
			if(conn){
				conn.release();
			}

			originalCb(...resargs);
			conn = undefined;
		};

		if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
			originalCb = args[args.length -1];
			args[args.length -1] = cb;
		}

		DAL.getConnection((err, connection) => {
			if(err){
				return cb(err);
			}

			conn = connection;
			connection[name](...args);
		});
	}
}
