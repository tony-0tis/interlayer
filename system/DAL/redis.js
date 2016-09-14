"use strict"
let redis = require('redis');
let log = global.logger.create('REDIS');
let helpers = require('../helpers');

let retry_strategy = options => {
	if(options.error && options.error.code === 'ECONNREFUSED'){
		// End reconnecting on a specific error and flush all commands with a individual error
		return new Error('The server refused the connection');
	}

	if(options.total_retry_time > 1000 * 60 * 60){
		// End reconnecting after a specific timeout and flush all commands with a individual error
		return new Error('Retry time exhausted');
	}

	if(options.times_connected > 10){
		// End reconnecting with built in error
		return undefined;
	}

	// reconnect after
	return Math.max(options.attempt * 100, 3000);
};

let DAL = {
	connections: [],
	opened: [],
	getOrCreate: cb => {
		if(DAL.connections.length){
			let connection = DAL.connections.shift();
			connection.lastOpened = Date.now();
			DAL.opened.push(connection);
			DAL._checkConnections();
			return cb(null, connection.redis);
		}

		let connection = {
			redis: redis.createClient(null, null, {retry_strategy: retry_strategy}),
			id: helpers.generateId()
		};
		connection.redis.on('error', err => {
			log.e('Error in redis exports.connection:', err, new Error().stack);
			connection.redis.quit();
			connection = null;
			cb(err);
		});
		connection.redis.on('ready', () => {
			connection.lastOpened = Date.now();
			DAL.opened.push(connection);
			cb(null, connection.redis);
		});
		connection.redis.on('requestEnded', (err) => {
			let id;
			for(let i in DAL.opened){
				if(DAL.opened[i].id == connection.id){
					id = i;
				}
			}
			if(!id){
				return log.e('No opened id', id);
			}

			let conn = DAL.opened.splice(id, 1);
			DAL.connections.push(conn);
		});
		DAL._checkConnections();
	},
	_checkConnections: () => {
		DAL.opened = DAL.opened.reduse((res, conn) =>{
			if(Date.now() - conn.lastOpened > 14400000){
				conn.redis.quit();
				delete conn.redis;
				conn = null;
			}
			else{
				res.push(conn);
			}
			return res;
		}, [])
		DAL.connections = DAL.connections.reduse((res, conn) => {
			if(Date.now() - conn.lastOpened > 14400000){
				conn.redis.quit();
				delete conn.redis;
				conn = null;
			}
			else{
				res.push(conn);
			}
		}, []);
	}
};

exports.methods = {};
for(let name in redis.RedisClient.prototype){
	exports.methods[name] = (...args) => {
		let conn;
		let cb = (...args) => {
			if(typeof cb != 'function'){
				return;
			}
			conn.emit('requestEnded');
			cb(...args);
		};
		
		if(typeof args[args.length -1] == 'function' && args[args.length -1] instanceof Function){
			args[args.length -1] = cb;
		}
		else{
			args.push(cb);
		}

		DAL.getOrCreate((err, connection) => {
			if(err){
				return cb(err);
			}
			conn = connection;
			connection[name](...args);
		});
	};
}
