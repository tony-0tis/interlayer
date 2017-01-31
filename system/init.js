"use strict"
let log = global.logger.create('INIT');
let fs = require('fs');
let pathMod = require('path');
let url = require('url');
let qs = require('querystring');
let crypto = require('crypto');
let async = require('async');

let DAL = require('./DAL');
let Emails = require('./mail');

let DAL_connections;
let emailSenders;
let modules = {};
let middlewares = [];
let i18n = {};
let serve = null;
let pathCheck = /[\w\.\/]*/;

let defaultRequestFuncs = {
	i18n: function(key, def){
		for(let i in this.langs){
			if(i18n[this.langs[i]] && i18n[this.langs[i]][key]){
				return i18n[this.langs[i]][key];
			}
		}

		return def;
	},
	addCookies: function(key, val){
		this.responseCookies[key] = val;
	},
	rmCookies: function(key){
		this.responseCookies[key] = '';
	},
	error: function(text){
		this.end(
			this.i18n('service.503', 'Service Unavailable. Try again another time.') + (this.config.debug ? ' (' + text + ')' : ''),
			503,
			{
				'Content-Type': 'text/plain; charset=utf-8'
			}
		);
	},
	getView: function(view, file, cb){
		if(!cb && !file){
			throw 'minimum 2 arguments with last callback';
		}
		if(!cb){
			cb = file;
			file = view;
			view = null;
		}
		let tries = [];
		for(let i in this.config.view){
			if(!this.config.view.hasOwnProperty(i)){
				continue;
			}
			tries.push(
				new Promise((ok,fail) => {
					try{
						if(!fs.statSync(pathMod.join(this.config.view[i], file)).isFile()){
							log.d('Not file', pathMod.join(this.config.view[i], file));
							return fail();
						}
					}catch(e){
						log.d('bad stat', pathMod.join(this.config.view[i], file), e);
						return fail(e);
					}

					fs.readFile(pathMod.join(this.config.view[i], file), (err, res) => {
						if(err){
							log.d('read err', pathMod.join(this.config.view[i], file), err);
							return fail(err);
						}
						return ok(res);
					});
				})
			);
		}
		Promise.race(tries)
		.then(result => cb(null, (result||'').toString()))
		.catch(err => {
			log.e(err);
			cb('Not found');
		});
	},
	getViewSync: function(view, file){
		if(!file){
			file = view;
		}
		return this.config.view.requce((res, view)=>{
			if(res){
				return res;
			}
			try{
				if(!fs.statSync(pathMod.join(view, file)).isFile()){
					return res;
				}
			}catch(e){
				return res;
			}
			try{
				return fs.readFileSync(pathMod.join(view, file));
			}
			catch(e){
				return res;
			}
		}, '').toString() || null;
	},
	parsePost: function(request, cb){
		if(!this.isPost){
			return cb();
		}

		let body = '';

		request.on('data', data => {
			body += data;

			if(body.length > 1e6){
				request.connection.destroy();
				return cb('POST TOO BIG');
			}
		});

		request.on('end', () => {
			try{
				this.post = JSON.parse(body);
			}catch(e){
				try{
					this.post = qs.parse(body);
				}catch(ee){
					this.post = body;
				}
			}

			delete this.parsePost;

			return cb();
		});
	},
	modifyLog: function(logToFodify){
		if(!logToFodify){
			throw 'You must specify log instance by define it in varible with global.logger.create("MODULE_IDENTITY")';
		}
		return Object.keys(logToFodify).reduce((res, color) => {
			color = color.toLowerCase();
			if(color == 'add'){
				return res;
			}

			if(logToFodify[color].modifed){
				throw 'Do not call modifyLog twice at one log';
			}

			let original = logToFodify[color];
			res[color] = (...args) => {
				args.unshift('[rID:' + this.id + ']');
				original.apply({logModifed: true}, args);
			};
			res[color].modifed = true;
			return res;
		}, {});
	},
	getFile: function(file, cb){
		let contentType = this.helpers.mime(file);
		try{
			if(!fs.statSync(pathMod.join(view, file)).isFile()){
				return cb('NO A FILE');
			}
		}catch(e){
			return cb('NO FILE');
		}

		fs.readFile(file, (err, res) => {
			if(err){
				return cb('BAD FILE');
			}

			cb(null, res, {'Content-Type': contentType});
		});
	}
};
defaultRequestFuncs.addCookie = defaultRequestFuncs.addCookies;
defaultRequestFuncs.setCookie = defaultRequestFuncs.addCookies;
defaultRequestFuncs.setCookies = defaultRequestFuncs.addCookies;
defaultRequestFuncs.rmCookie = defaultRequestFuncs.rmCookies;
defaultRequestFuncs.delCookie = defaultRequestFuncs.rmCookies;
defaultRequestFuncs.delCookies = defaultRequestFuncs.rmCookies;

exports.pools = {};

exports.helpers = require('./helpers');

exports.getModule = module => modules[module] || modules[module.replace(/\/$/, '')];

exports.parseRequest = (request, response, config) => {
	let requestObject = {
		id: exports.helpers.generateId(),
		config: config,
		helpers: exports.helpers,
		DAL: DAL_connections,
		mail: emailSenders,
		url: request.url,
		path: url.parse(request.url).pathname.substring(1),
		method: request.method,
		isPost: request.method == 'POST',
		responseCookies: {},
		cookies: {},
		params: {},
		post: {},
		headers: JSON.parse(JSON.stringify(request.headers)),
		langs: (request.headers['accept-language'] || 'en').match(/(\w{2}(-\w{2})?)/g),
		ip: request.headers['x-forwarded-for'] ||
			request.connection.remoteAddress ||
			request.socket && request.socket.remoteAddress ||
			request.connection.socket && request.connection.socket.remoteAddress,
	};

	requestObject.params = qs.parse(url.parse(requestObject.url).query);
	for(let i in requestObject.params){
		if(exports.helpers.isBoolean(requestObject[i])){
			requestObject[i] = Boolean(requestObject[i]);
		}
	}

	if(requestObject.params.callback){
		requestObject.jsonpCallback = requestObject.params.callback;
		delete requestObject.params.callback;
	}

	if(request.headers.cookie){
		request.headers.cookie.split(';').forEach(cookie => {
			let parts = cookie.split('=');
			requestObject.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
		});
	}

	let originalResposeEnd = response.end;
	var clearRequest = () => {
		//objects
		delete requestObject.config;
		delete requestObject.helpers;
		delete requestObject.DAL;
		delete requestObject.email;

		//current request functions
		delete requestObject.getResponse;
		delete requestObject.end;

		// default functions
		delete requestObject.i18n;
		delete requestObject.error;
		delete requestObject.addCookies;
		delete requestObject.rmCookies;
		delete requestObject.getView;
		delete requestObject.getViewSync;
		delete requestObject.parsePost;
		delete requestObject.modifyLog;

		if(originalResposeEnd){
			response.end = originalResposeEnd;
		}

		originalResposeEnd = undefined;
		requestObject = undefined;
		clearRequest = undefined;
	};

	Onject.keys(defaultRequestFuncs).map(k => {
		requestObject[k] = defaultRequestFuncs[k];
	});

	requestObject.log = requestObject.modifyLog(global.logger.create());

	requestObject.getResponse = () => {
		response.end = function(...args){
			if(!requestObject || requestObject.ended || !originalResposeEnd){
				if(requestObject){
					clearRequest();
				}
				requestObject = undefined;
				throw 'FORBIDEN';
			}

			requestObject.ended = true;
			response.end = originalResposeEnd;
			originalResposeEnd = undefined;
			response.end(args);
			delete response.end;

			clearRequest();
		};
		return response;
	};

	requestObject.end = (text='', code=200, headers={'Content-Type': 'text/html; charset=utf-8'}, type='text') => {
		if(!requestObject || requestObject.ended){
			requestObject = undefined;
			return;
		}

		requestObject.ended = true;

		if(!text){
			code = 204;
		}

		if(type == 'bin'){
			headers['Content-Length'] = new Buffer(text, 'binary').length;
		}
		else{
			text = text.toString().replace(new RegExp('\%\\$.*\%', 'g'), '');

			if(requestObject.jsonpCallback){
				if(headers['Content-Type'] == 'application/json'){
					text = requestObject.jsonpCallback + '(\'' + text + '\');';
				}
				else{
					text = requestObject.jsonpCallback + '("' + text + '");';
				}
			}

			headers['Content-Length'] = new Buffer(text).length;
		}

		if(config.defaultHeaders){
			for(let i in config.defaultHeaders){
				if(!config.defaultHeaders.hasOwnProperty(i)){
					continue;
				}
				headers[i] = config.defaultHeaders[i];
			}
		}

		if(requestObject.responseCookies){
			let cookies = [];
			let expires = new Date();
			expires.setDate(expires.getDate() + 5);
			for(let i in requestObject.responseCookies){
				if(!requestObject.responseCookies.hasOwnProperty(i)){
					continue;
				}
				cookies.push(i + '=' + encodeURIComponent(requestObject.responseCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
			}
			headers['Set-Cookie'] = cookies;
		}

		response.writeHead(code, headers);
		if(type == 'bin'){
			response.write(text, 'binary');
		}
		else{
			response.write(text);
		}
		response.end();

		clearRequest();
	};

	return requestObject;
};

exports.middleware = (request, moduleMeta, cb) => {
	if(!middlewares.length){
		log.d('No middlewares');
		return cb();
	}

	let count = 0;
	async.whilst(
		() => {
			return count < middlewares.length;
		},
		(cb) => {
			let middleware = middlewares[count];
			count++;
			if(middleware.triggers['*']){
				middleware.triggers['*'](request, moduleMeta, cb);
				return;
			}

			let funcs = Object.keys(middleware.triggers).reduce((res, trigger) => {
				let run = false;
				let isMeta = trigger.match(/^meta\./);
				let isRequest = trigger.match(/^request\./);
				if(isMeta || isRequest){
					let p = trigger.split('.').splice(1);
					let path = isMeta ? moduleMeta : request;
					for(let i in p){
						if(!p.hasOwnProperty(i)){
							continue;
						}
						if(path[p[i]]){
							path = path[p[i]];
							run = true;
						}
						else{
							run = false;
							break;
						}
					}
				}
				if(run){
					res.push(middleware.triggers[trigger].bind({}, request, moduleMeta));
				}
				return res;
			}, []);
			async.series(funcs, cb);
		},
		cb
	);
};

exports.serve = (request, cb) => {
	if(!serve){
		return cb();
	}

	log.d('Try to serve', request.path);
	let paths = [...serve];
	let done = false;
	async.whilst(
		() => !done,
		(cb) => {
			if(paths.length == 0){
				done = true;
				return cb();
			}
			let p = paths.shift();
			log.d('check path', p);
			if(!p){
				return cb();
			}
			request.getFile(pathMod.join(p, request.path), (err, res, headers) => {
				if(err){
					return cb();
				}

				done = true;
				cb(null, [res, headers]);
			});
		},
		(err, res) => {
			if(err){
				return cb(err);
			}

			if(!res){
				return cb('NOT FOUND', null, 404);
			}

			cb(null, res[0], 200, res[1]);
		}
	)
};

exports.timeout = (config, meta, cb) => {
	var called = false;
	setTimeout(() => {
		if(!called){
			called = true;
			return cb('TIMEOUT', null, 408);
		}
	}, (meta.timeout || config.timeout || 60) * 1000);
	return (...args) => {
		if(called){
			log.e('request ended', args);
			return;
		}

		called = true;
		return cb(...args);
	}
};

exports.auth = (module, request) => {
	if(module.auth/* || module.rights*/){
		let header = request.headers.authorization || '';
		let token = header.split(/\s+/).pop() || '';
		let auth = new Buffer(token, 'base64').toString();
		let parts = auth.split(':');
		auth = crypto.createHash('md5').update(auth).digest('hex');
		let moduleAuth = module.auth == 'default' && helpers.defaultAuth ? helpers.defaultAuth : module.auth;

		if(moduleAuth !== true && moduleAuth != auth){
			return false;
		}
	}

	return true;
};

// ### INITS
exports.initServe = (paths, config) => {
	if(paths.serve && paths.serve.length){
		serve = paths.serve;
		log.i('Server start serve dirs', serve);
	}
};

exports.initDALs = (paths, config) => {
	DAL_connections = DAL.init(paths, config);
	return DAL_connections;
};

exports.initModules = (paths, config) => {
	let inits = {};
	paths.modules.forEach(path => {
		let pathModules = fs.readdirSync(path);

		let getUrl = (moduleName, methodName, module, meta) => {
			if(module.addToRoot || meta.addToRoot){
				return methodName;
			}

			if(meta.path && meta.path.match(pathCheck)){
				methodName = meta.path;
			}

			return moduleName + '/' + methodName;
		};

		for(let file of pathModules){
			try{
				let isDir = false;
				if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
					continue;
				}

				if(fs.lstatSync(path + '/' + file).isDirectory()){
					if(!fs.accessSync(path + '/' + file + '/index.js')){
						if(!fs.statSync(path + '/' + file + '/index.js').isFile()){
							continue;
						}
					}

					isDir = true;
				}

				if(!file.match(/^.*\.js$/) && !isDir){
					continue;
				}

				let moduleName = file.replace('.js', '');
				let module = require(pathMod.resolve(path) + '/' + file + (isDir ? '/index.js' : ''));//eslint-disable-line global-require

				if(module.__init){
					inits[file] = module.__init;
				}

				if(module.__meta){
					if(module.__meta.html){
						modules[moduleName] = {
							func: module.__meta.html,
							meta: module.__meta
						};
					}
				}
				for(let m in module){
					if(m.indexOf('__') === 0){
						continue;
					}

					if(m.indexOf('_') === 0){
						let methodMeta = module[m];
						let methodName = m.substring(1);

						if(!module[methodName]){
							log.e('module', moduleName, 'Method', methodName, 'in file', file, 'not found');
							continue;
						}

						let method = {
							func: module[methodName],
							meta: Object.assign({}, module.__meta || {}, methodMeta),
							definedIn: file
						};

						methodName = getUrl(moduleName, methodName, module, methodMeta);

						if(modules[methodName]){
							log.e('module', moduleName, 'Method', methodName, 'in file', file, 'IS DEFINED IN', modules[methodName].definedIn);
							continue;
						}

						modules[methodName] = method;

						let aliasURL = methodMeta.alias;
						if(aliasURL){
							aliasURL = getUrl(moduleName, aliasURL, module, methodMeta);
							if(modules[aliasURL]){
								log.e('module', moduleName, 'Method', aliasURL, 'in file', file, 'IS DEFINED IN', modules[aliasURL].definedIn);
								continue;
							}

							modules[aliasURL] = method;
						}
					}
				}
				module = null;
			}
			catch(err){
				log.e('Error in module ' + path + '/' + file, err, err.stack);
			}
		}
	});

	log.d('server methods accessible from the outside\n', Object.keys(modules));

	let context = {
		url: '',
		headers: {},
		DAL: DAL_connections,
		config: config,
		helpers: exports.helpers
	};
	for(let ii in inits){
		if(!inits.hasOwnProperty(ii)){
			continue;
		}
		try{
			inits[ii](context, function(){});
		}catch(e){
			log.e('__init()', ii, e);
		}
	}
};

exports.initMiddlewares = (paths, config) => {
	let inits = {};
	paths.middleware.forEach(path => {
		let pathMiddleware = fs.readdirSync(path);

		for(let file of pathMiddleware){
			try{
				if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
					continue;
				}

				if(fs.lstatSync(path + '/' + file).isDirectory()){
					continue;
				}

				let middleware = require(pathMod.resolve(path) + '/' + file);//eslint-disable-line global-require

				if(middleware.__init){
					inits[file] = middleware.__init;
				}

				let middlewareObject = {
					name: file.replace('.js', '')
				};

				if(!middleware.triggers){
					if(!middleware.run){
						log.e('middleware', file, 'have no property `triggers` and method `run`');
						continue;
					}
					middlewareObject.triggers = {
						'*': middleware.run
					};
				}
				else if(Array.isArray(middleware.triggers)){
					if(!middleware.run){
						log.e('middleware', file, 'have no method `run`');
						continue;
					}
					middlewareObject.triggers = middleware.triggers.reduce((res, cur) => {
						res[cur] = middleware.run;
						return res;
					}, {});
				}
				else if(typeof middleware.triggers == 'object'){
					middlewareObject.triggers = {};
					for(let t in middleware.triggers){
						if(typeof middleware.triggers[t] == 'function'){
							middlewareObject.triggers[t] = middleware.triggers[t];
							continue;
						}

						if(!middleware[middleware.triggers[t]]){
							log.e('in middleware', file, 'trigger', t, 'linked to undefined method');
							continue;
						}

						if(typeof middleware[middleware.triggers[t]] != 'function'){
							log.e('in middleware', file, 'trigger', t, 'linked to non function', middleware.triggers[t]);
							continue;
						}

						middlewareObject.triggers[t] = middleware[middleware.triggers[t]];
					}
				}

				middlewares.push(middlewareObject);

				middleware = null;
			}
			catch(err){
				log.e('Error in middleware ' + path + '/' + file, err, err.stack);
			}
		}
	});

	if(config.middlewareOrder){
		for(let i in config.middlewareOrder){
			if(!config.middlewareOrder.hasOwnProperty(i)){
				continue;
			}

			let ind = -1;
			for(let i in middlewares){
				if(middlewares[i].name == config.middlewareOrder[i]){
					ind = i;
					break;
				}
			}
			if(ind < 0){
				log.e('middleware specified in config.middlewareOrder has not been initialized', middlewares, config.middlewareOrder[i]);
				continue;
			}
			middlewares.splice(i, 0, middlewares.splice(ind, 1).pop());
		}
	}
};

exports.initI18n = (paths, config) => {
	paths.i18n.forEach(path => {
		let pathI18n = fs.readdirSync(path);

		for(let file of pathI18n){
			try{
				if(file.indexOf('.') == 1 || file.indexOf('..') == 1){
					continue;
				}

				if(fs.lstatSync(path + '/' + file).isDirectory()){
					continue;
				}

				if(file.split('.').pop() != 'json'){
					log.w('In catalog with i18n files founded non json file', file);
					continue;
				}

				i18n[file.replace('.json', '')] = JSON.parse(fs.readFileSync(pathMod.join(path, file)));
			}
			catch(err){
				log.e('Error in i18n ' + path + '/' + file, err, err.stack);
			}
		}
	});
};

exports.initEmailSenders = (paths, config) => {
	emailSenders = Emails.init(paths, config);
};
