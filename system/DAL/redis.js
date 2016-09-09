"use strict"
let redis = require('redis');
let log = global.logger.create('REDIS');
let helpers = require('../helpers');

log.d('INIT REDIS');

exports.init = cb => {
	exports.connection = redis.createClient(null, null, {retry_strategy: retry_strategy});
	exports.connection.on('error', err => {
		log.e('Error in redis exports.connection:', err, new Error().stack);
		exports.connection = null;
		cb('no connection');
	});
	exports.connection.on('ready', () => {
		cb(null, exports.connection);
	});
};

exports.getRedisConnection = cb => {
	if(exports.connection){
		cb(null, exports.connection);
		return;
	}
	exports.init(cb);
};

exports.getNewRedisConnection = cb => {
	let conn = redis.createClient(null, null, {retry_strategy: retry_strategy});
	conn.on('error', err => {
		log.e('Error in redis conn:', err, new Error().stack);
		conn = null;
		cb('no connection');
	});
	conn.on('ready', () => {
		cb(null, conn);
	});
};

let DAL = {
	connections: [],
	opened: [],
	getOrCreate: (cb, failCb) => {
		if(DAL.connections.length){
			let connection = DAL.connections.shift();
			connection.lastOpened = Date.now();
			DAL.opened.push(connection);
			DAL._checkConnections();
			return cb(connection.redis);
		}

		let connection = {
			redis: redis.createClient(null, null, {retry_strategy: retry_strategy}),
			id: helpers.generateId()
		};
		connection.redis.on('error', err => {
			log.e('Error in redis exports.connection:', err, new Error().stack);
			connection.redis.quit();
			connection = null;
			failCb();
		});
		connection.redis.on('ready', () => {
			connection.lastOpened = Date.now();
			DAL.opened.push(connection);
			cb(connection.redis);
		});
		connection.redis.on('requestEnded', () => {
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

function retry_strategy(options){
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
}

exports.dal = {};
for(let name in redis.RedisClient.prototype){
	exports.dal[name] = (...args) => {
		let cb = args[args.length -1];
		if(typeof cb != 'function'){
			cb = function(){};
		}

		DAL.getOrCreate(function(connection){
			return connection[name].apply(connection, args);
		}, cb);
	};
}
