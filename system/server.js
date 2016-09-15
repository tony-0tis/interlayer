"use strict";
let log;
let http = require('http');
let async = require('async');
let init;
let config;

exports.start = (paths, conf) => {
	config = conf;
	global.logger = require('./logger.js').logger(__dirname);
	log = global.logger.create('SRV');
	init = require('./init.js')
	
	let server = http.createServer(requestFunc);
	server.listen(conf.port || 8080);
	log.i('server started on port: ' + conf.port || 8080);
	init.initDALs(paths, conf);
	init.initModules(paths, conf);
}

process.on('message', obj => {
	switch(obj.type){
		case 'start':
			exports.start(obj.paths, obj.config)
		break;
		default: 
			(log && log.c || console.log)('Unknown message type', obj);
	}
});
process.on('uncaughtException', err => (log && log.c || console.log)('Caught exception:', err));

function requestFunc(request, response){
	init.parseRequest(request, response);
	request.config = config;
	
	let module = init.getModule(request.path);
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