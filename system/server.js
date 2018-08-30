let http = require('http');
let async = require('async');
//let WebSocket = require('ws');
let logger = require('./logger.js');
let init = null;
let helpers = null;

let defLog;
let pings = [];

process.on('uncaughtException', err => (defLog && defLog.c || console.error)('Caught exception:', err));

exports.start = (paths, conf) => {
	global.logger = logger.logger(conf.logPath, conf.debug);
	defLog = global.logger.create('SRV');

	helpers = require('./helpers');
	init = require('./init.js')(paths, conf);
	
	let server = http.createServer(requestFunc);
	server.listen(conf.port || 8080);
	// let websocket;//https://github.com/websockets/ws#server-example
	// if(conf.websocket == true){
	// 	websocket = new WebSocket.Server({server});
	// }

	defLog.i('server started on port: ' + (conf.port || 8080));
};

function requestFunc(request, response){
	let requestObject = init.reconstructRequest(request, response);
	let log = requestObject.modifyLog(defLog);
	let reqStart = Date.now();
	
	let module = init.getModule(requestObject.path);
	
	if(!module){
		return init.serve(requestObject, (err, data) => {
			if(data){
				log.i(requestObject.ip, 'SERVE', requestObject.path)
				return requestObject.end(data, 200, {'Content-Type': helpers.mime(requestObject.path)});
			}

			log.i('BAD', requestObject.ip, 'REQ: ' + requestObject.path);
			return requestObject.end('<title>' + requestObject.i18n('title_error_404', 'Not found') + '</title>Error 404, Not found', 404);
		});
	}

	let disableNagleAlgoritm = false;
	if(init.config.disableNagleAlgoritm == true || module.meta.disableNagleAlgoritm == true){
		disableNagleAlgoritm = true;
	}
	if(module.meta.disableNagleAlgoritm == false){
		disableNagleAlgoritm = false;
	}
	if(disableNagleAlgoritm == true){
		request.socket.setNoDelay(); // Disable Nagle's algorytm
	}

	/*if(!helpers.auth(module.meta, requestObject)){
		return requestObject.end('Access denied', 401, {'WWW-Authenticate': 'Basic realm="example"'});
	}*/ // not working yet

	async.auto({
		post: cb => helpers.parsePost(requestObject, request, cb),
		middleware: ['post', (res, cb) => {
			let middlewareTimeout = init.config.middlewareTimeout || module.meta.middlewareTimeout || 10;
			init.middleware(requestObject, module.meta, helpers.timeout({timeout: middlewareTimeout}, {}, (e, data, code, headers) => {
				if(e){
					res.data = {error: e};
					res.code = code || 200;
					res.headers = headers || {'Content-Type': 'application/json'};
					res.middlewareError = true;
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
			let next = helpers.timeout(init.config, module.meta, (e, data, code, headers, type) => {
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
				let id = helpers.generateId();
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
				helpers.toJson(res);
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
				'GET: ' + helpers.clearObj(requestObject.params, ['token']),
				'POST: ' + helpers.clearObj(requestObject.post, ['token']),
				'len: ' + (res.data && res.data.length),
				'time: ' + ((Date.now() - reqStart) / 1000) + 's'
			);
		}

		if(err){
			return requestObject.error(err);
		}

		if(!requestObject.responseFree){
			requestObject.end(res.data, res.code, res.headers, res.type);
		}
	});
}

global.intervals = {
	_si: setInterval(() => {
		for(let i in intervals._funcs){
			if(!intervals._funcs.hasOwnProperty(i)){
				continue;
			}

			if(intervals._funcs[i].runafter && Date.now() < intervals._funcs[i].runafter){
				continue;
			}

			if(intervals._funcs[i].runafter){
				intervals._funcs[i].runafter = Date.now() + intervals._funcs[i].t * 1000
			}

			intervals._funcs[i].f(() => {
				intervals.del(intervals._funcs[i].key);
			});
		}
	}, 1000),
	_funcs: [],
	add: function(f, t){
		let key = Math.random() * Date.now();
		this._funcs.push({
			key: key,
			f: f,
			t: t,
			runafter: t ? Date.now() + t * 1000 : null
		});
	},
	del: function(key){
		let ind = this._funcs.reduce((r,f,ind)=>{
			if(f.key == key){
				r = ind;
			}
			return r;
		}, -1);
		this._funcs.splice(ind, 1);
		return key;
	}
};

process.on('message', obj=> {
	switch(obj.type){
		case 'start': 
			exports.start(obj.paths, obj.config);
			break;
		case 'ping':
			if(process.send){
				process.send({
					type: 'pong',
					id: obj.id
				});
			}
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

if(process.send){// only if this node in cluster	
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
	}, 1);
}