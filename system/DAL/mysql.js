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
		throw 'wrong mysql config, check database set';
	}
	DAL = mysql.createPool(conf);
};

exports.methods = {};
for(let name in connectionMethods.prototype){
	if(name.indexOf('_') == 0){
		continue;
	}
	if(['format', 'escapeId', 'escape'].indexOf(name) > -1){
		exports.methods[name] = (...args) => connectionMethods.prototype[name].call(DAL, ...args);
		continue;
	}

	wrapMethod(name);
}
function wrapMethod(name){
	exports.methods[name] = function(...args){
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
			let sql = connection[name](...args);
			if(this.showSql){
				log.w(sql.sql);
			}
		});
	}
}
