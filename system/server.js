"use strict";
let logger = require('./system/logger.js').logger(__dirname);
global.logger = logger;

let log = logger.create('SRV');
process.on('uncaughtException', err => log.c('Caught exception:', err));

let http = require('http');
let async = require('async');

let init = require('./system/init.js');
let config;
try{
	config = require('./config.js').config;
}catch(e){
	config = {};
}

let server = http.createServer(requestFunc);
server.listen(config.server_port || 8080);
log.i('server started on port: 8080');

function requestFunc(request, response){
	init.parseRequest(request, response);
	request.config = config;
	
	let module = init.modules[request.path];
	if(!module){
		log.d('BAD', request.headers['x-forwarded-for'] ||
			request.connection.remoteAddress ||
			request.socket.remoteAddress ||
			request.connection.socket.remoteAddress,
			'REQ: ' + request.path
		);

		return request.end('Error 404<title>' + config.error_title + '</title>', 404);
	}

	if(!init.auth(module, request)){
		return request.end('Access denied', 401, {'WWW-Authenticate': 'Basic realm="example"'});
	}

	async.auto({
		post: cb => init.parsePost(request, cb),
		prerun: cb => {
			if(!module.meta.prerun){
				return cb();
			}

			module.meta.prerun(request, module.meta, cb);
		},
		module: ['post', 'prerun', (res, cb) => {
			let poolId = request.params.poolingId || request.post.poolingId;
			let withPool = request.params.withPooling || request.post.withPooling;
			let next = cb;

			if(poolId){
				if(!init.pools[poolId]){
					return next('BAD_POOL_ID');
				}

				return next(null, init.pools[poolId]);
			}
			else if(withPool){
				let id = init.helpers.generateId();
				init.pools[id] = {
					poolingId: id
				};

				cb(null, init.pools[id]);
				next = (err, res) => {
					init.pools[id] = res;
				};
			}

			try{
				module.func(request, (e, data, code, headers, type) => {
					if(e){
						data = {error: e};
						code = 200;
						headers = {'Content-Type': 'application/json'};
						type = null;
					}

					res.data = data;
					res.code = code || 200;
					res.headers = headers || {};
					res.type = type;
					next();
				});
			}
			catch(e){
				log.e(e);
				next(e);
			}
		}],
		json: ['module', (res, cb) =>{
			if(module.meta.toJson || module.meta.contentType == 'json' || res.headers['Content-Type'] == 'application/json'){
				init.helpers.toJson(res);
			}

			cb();
		}]
	},
	(err, res) => {
		if(module.meta && module.meta.skipRequestLog !== true){
			log.d(
				request.headers['x-forwarded-for'] ||
					request.connection.remoteAddress ||
					request.socket.remoteAddress ||
					request.connection.socket.remoteAddress,
				'REQ: ' + request.path,
				'FROM: ' + (request.headers.referer || '---'),
				'GET: ' + init.helpers.clearObj(request.params),
				'POST: ' + init.helpers.clearObj(request.post),
				'len:' + (res.data && res.data.length),
				module.meta.auth ? '(A)' : ''
			);
		}

		if(err){
			return request.error(err);
		}

		request.end(res.data, res.code, res.headers, res.type);
	});
}