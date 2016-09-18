"use strict"
let log = global.logger.create('INIT');
let fs = require('fs');
let pathMod = require('path');
let url = require('url');
let qs = require('querystring');
let crypto = require('crypto');
let DAL = require('./DAL');

let DAL_connections;

exports.helpers = require('./helpers');
let modules = {};
let inits = {};

exports.initDALs = (paths, config) => {
	DAL_connections = DAL.init(paths, config);
	return DAL_connections;
};

exports.getModule = module => modules[module];

exports.initModules = (paths, config) => {
	paths.modules.forEach(path => {
		let pathModules = fs.readdirSync(path);

		let getUrl = (moduleName, methodName, module, meta) => {
			if(module.addToRoot || meta.addToRoot){
				return methodName;
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
				let module = require(pathMod.resolve(path) + '/' + file + (isDir ? '/index.js' : ''));

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
		DAL: DAL_connections
	};
	for(let ii in inits){
		try{
			inits[ii](context, function(){});
		}catch(e){
			log.e('__init()', ii, e);
		}
	}
}

exports.pools = {};
let defaultRequestFuncs = {
	addCookies: function(key, val){
		this.newCookies[key] = val;
	},
	rmCookies: function(key){
		this.newCookies[key] = '';
	},
	error: function(text){
		this.end(
			this.i18n('service.503', 'Service Unavailable. Try again another time.') + (this.config.debug ? ' (' + text + ')' : ''),
			503,
			{
				'Content-Type': 'text/plain; charset=utf-8',
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
			tries.push(
				new Promise((ok,fail) => {
					fs.readFile(pathMod.join(this.config.view[i], file), (err, res) => {
						if(err){
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
			cb('Not found')
		});
	},
	getViewSync: function(view, file, cb){
		if(cb){
			throw 'maximum 2 arguments, without callback';
		}
		if(!file){
			file = view;
		}
		return this.config.view.requce((res, view)=>{
			if(res){
				return res;
			}
			try{
				return fs.readFileSync(pathMod.join(view, file));
			}
			catch(e){
				return res;
			}
		}, '').toString() || null;
	}
}
exports.parseRequest = (request, response, config) => {
	let requestObject = {
		DAL: DAL_connections,
		url: request.url,
		path: url.parse(request.url).pathname.substring(1),
		method: request.method,
		isPost: request.method == 'POST',
		pools: exports.pools,
		helpers: exports.helpers,
		cookies: {},
		newCookies: {},
		config: config,
		params: {},
		post: {},
		headers: JSON.parse(JSON.stringify(request.headers))
	};

	requestObject.params = qs.parse(url.parse(requestObject.url).query);

	if(requestObject.params.callback){
		requestObject.jsonpCallback = requestObject.params.callback;
		delete requestObject.params.callback;
	}

	request.headers.cookie && request.headers.cookie.split(';').forEach(cookie => {
		let parts = cookie.split('=');
		requestObject.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
	});

	let originalResposeEnd = response.end;
	var clearRequest = () => {
		delete requestObject.DAL;
		delete requestObject.pools;
		delete requestObject.helpers;
		delete requestObject.config;

		delete requestObject.getHeader;
		delete requestObject.getResponse;
		delete requestObject.addCookies;
		delete requestObject.rmCookies;
		delete requestObject.parsePost;
		delete requestObject.error;
		delete requestObject.end;

		response.end = originalResposeEnd;

		originalResposeEnd = undefined;
		requestObject = undefined;
		clearRequest = undefined;
	};

	requestObject.error = defaultRequestFuncs.error;
	requestObject.addCookies = defaultRequestFuncs.addCookies;
	requestObject.rmCookies = defaultRequestFuncs.rmCookies;
	requestObject.getView = defaultRequestFuncs.getView;
	requestObject.getViewSync = defaultRequestFuncs.getViewSync;

	requestObject.getResponse = () => {
		response.end = function(...args){
			if(!requestObject || requestObject.ended || !originalResposeEnd){
				if(requestObject){
					clearRequest();
				}
				requestObject = undefined;
				return 'FORBIDEN';
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
	requestObject.i18n = (key, def) => {
		return def;
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
				headers[i] = config.defaultHeaders[i];
			}
		}

		if(requestObject.newCookies){
			let cookies = [];
			let expires = new Date();
			expires.setDate(expires.getDate() + 5);
			for(let i in requestObject.newCookies){
				cookies.push(i + '=' + encodeURIComponent(requestObject.newCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
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
	requestObject.parsePost = cb => {
		if(!requestObject.isPost){
			return cb();
		}

		let body = '';

		request.on('data', data => {
			body += data;

			if(body.length > 1e6){
				request.connection.destroy();
				cb('POST TOO BIG');
			}
		});

		request.on('end', () => {
			try{
				requestObject.post = JSON.parse(body);
			}catch(e){
				try{
					requestObject.post = qs.parse(body);
				}catch(ee){
					requestObject.post = body;
				}
			}

			delete requestObject.parsePost;

			cb();
		});
	};

	return requestObject;
};

exports.auth = (module, request) => {
	if(module.auth/* || module.rights*/){
		let header = request.headers.authorization || '';
		let token = header.split(/\s+/).pop() || '';
		header = undefined;
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
