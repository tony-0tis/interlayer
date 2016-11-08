"use strict";
let defLog;
let http = require('http');
let async = require('async');
let logger = require('./logger.js')
let config;
let init;

exports.start = (paths, conf) => {
	config = conf;
	global.logger = logger.logger(config.logPath, config.debug);
	defLog = global.logger.create('SRV');
	
	let server = http.createServer(requestFunc);
	server.listen(conf.port || 8080);
	if(conf.disableNagleAlgoritm == true){
		server.on('connection', socket => {
			socket.setNoDelay(); // Отключаем алгоритм Нагла.
		});
	}
	defLog.i('server started on port: ' + conf.port || 8080);
	init = require('./init.js'); // eslint-disable-line global-require
	init.initDALs(paths, conf);
	init.initModules(paths, conf);
	init.initMiddlewares(paths, conf);
	init.initI18n(paths, conf);
	init.initEmailSenders(paths, conf);
}

if(process.send){
	let intervals = {
		si: setInterval(() => {
			for(let i in intervals.funcs){
				if(!intervals.funcs.hasOwnProperty(i)){
					continue;
				}

				intervals.funcs[i](() => {
					intervals.del(i);
				});
			}
		}, 1000),
		funcs: [],
		add: function(f){
			this.funcs.push(f);
		},
		del: function(ind){
			this.funcs.splice(ind, 1);
		}
	}
	let pings = [];
	process.on('message', obj=> {
		switch(obj.type){
			case 'start': 
				exports.start(obj.paths, obj.config);
				break;
			case 'ping':
				process.send({
					type: 'pong',
					id: obj.id
				});
				break;
			case 'pong':
				let ind = pings.indexOf(obj.id);
				if(ind > -1){
					pings.splice(ind, 1);
				}
				break;
			case 'reload':
				setTimeout(()=>process.exit(0),1);
				break
			case 'exit':
				process.exit(1);
				break;

		}
	});
	intervals.add((deleteInterval) => {
		if(pings.length > 2){
			deleteInterval();
			process.exit(0);
			return;
		}
		let ping = {
			type: 'ping',
			id: Date.now()
		};
		pings.push(ping.id);
		process.send(ping);
	}, 1000);
}

process.on('uncaughtException', err => (defLog && defLog.c || console.log)('Caught exception:', err));

function requestFunc(request, response){
	let requestObject = init.parseRequest(request, response, config);
	let log = requestObject.modifyLog(defLog);
	
	let module = init.getModule(requestObject.path);
	if(!module){
		log.d('BAD', requestObject.headers['x-forwarded-for'] ||
			request.connection.remoteAddress ||
			request.socket.remoteAddress ||
			request.connection.socket.remoteAddress,
			'REQ: ' + requestObject.path
		);

		return requestObject.end('<title>' + requestObject.i18n('title_error_404', 'Not found') + '</title>Error 404, Not found', 404);
	}

	/*if(!init.auth(module.meta, requestObject)){
		return requestObject.end('Access denied', 401, {'WWW-Authenticate': 'Basic realm="example"'});
	}*/ // not working yet

	async.auto({
		post: cb => requestObject.parsePost(cb),
		middleware: ['post', (res, cb) => {
			let middlewareTimeout = config.middlewareTimeout || module.meta.middlewareTimeout || 10;
			init.middleware(requestObject, module.meta, init.timeout({timeout: middlewareTimeout}, {}, (e, data, code, headers) => {
				if(e){
					res.data = {error: e};
					res.code = code || 200;
					res.headers = headers || {'Content-Type': 'application/json'};
					return cb(null, true);
				}

				cb();
			}));
		}],
		prerun: ['middleware', (res, cb) => {
			if(!module.meta.prerun || res.middleware){
				return cb();
			}

			module.meta.prerun(requestObject, module.meta, cb);
		}],
		module: ['post', 'prerun', (res, cb) => {
			if(res.middleware){
				return cb();
			}

			let poolId = requestObject.params.poolingId || requestObject.post.poolingId;
			let withPool = requestObject.params.withPooling || requestObject.post.withPooling;
			let next = init.timeout(config, module.meta, (e, data, code, headers, type) => {
				if(e){
					data = {error: e};
					code = code || 200;
					headers = headers || {'Content-Type': 'application/json'};
					type = null;
				}

				res.data = data;
				res.code = code || 200;
				res.headers = headers || {};
				res.type = type;
				cb();
			});

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

				next(null, init.pools[id]);//eslint-disable-line callback-return
				next = (err, res) => {
					init.pools[id] = err || res;
				};
			}

			try{
				return module.func(requestObject, next);
			}
			catch(e){
				log.e(e);
				return next(e);
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
			log.i(
				requestObject.ip,
				'REQ: ' + requestObject.path,
				'FROM: ' + (requestObject.headers.referer || '---'),
				'GET: ' + init.helpers.clearObj(requestObject.params, ['token']),
				'POST: ' + init.helpers.clearObj(requestObject.post, ['token']),
				'len:' + (res.data && res.data.length)
			);
		}

		if(err){
			return requestObject.error(err);
		}

		requestObject.end(res.data, res.code, res.headers, res.type);
	});
}