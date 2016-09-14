"use strict"
let log = global.logger.create('INIT');
let fs = require('fs');
let pathMod = require('path');
let url = require('url');
let qs = require('querystring');
let crypto = require('crypto');
let DAL = require('./DAL');

let IS_DEBUG = true;
let DAL_connections;

exports.helpers = require('./helpers');
let modules = {};
let inits = {};

exports.initDALs = (paths, config) => {
	DAL_connections = DAL.init(paths, config);
	return DAL_connections;
};

exports.initModules = (paths, config) => {
	let path = 'modules';
	let pathModules = fs.readdirSync(path);

	let pathUrl = path.split('/');
	pathUrl.splice(pathUrl.indexOf('modules'), 1);
	pathUrl = pathUrl.join('/');
	if(pathUrl.length > 0){
		pathUrl = '/' + pathUrl;
	}

	let getUrl = (method, meta, module, moduleName) => {
		if(module.addToRoot || meta.addToRoot){
			return method;
		}

		let string = pathUrl;

		if(!meta.skipFileNameInPath){
			string += '' + moduleName;
		}

		string += '/' + method;
		return string;
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

					methodName = getUrl(methodName, methodMeta, module, moduleName);

					if(modules[methodName]){
						log.e('module', moduleName, 'Method', methodName, 'in file', file, 'IS DEFINED IN', modules[methodName].definedIn);
						continue;
					}

					modules[methodName] = method;

					let aliasURL = methodMeta.alias;
					if(aliasURL){
						aliasURL = getUrl(aliasURL, methodMeta, module, moduleName);
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
	//log.w(Object.keys(modules))

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
exports.parseRequest = (request, response) => {
	request.DAL = DAL_connections;
	request.path = url.parse(request.url).pathname.substring(1);
	request.params = qs.parse(url.parse(request.url).query);
	if(request.params.callback){
		request.jsonpCallback = request.params.callback;
		delete request.params.callback;
	}
	
	request.isPost = request.method == 'POST';
	request.pools = exports.pools;
	request.helpers = helpers;

	request.cookies = {};
	request.headers.cookie && request.headers.cookie.split(';').forEach(cookie => {
        let parts = cookie.split('=');
        request.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });

	request.getResponse = () => {
		return response;
	};
    request.addCookies = (key, val) => {
    	if(!request.setCookies){
    		request.setCookies = {};
    	}
    	request.setCookies[key] = val;
    };
    request.rmCookies = key => {
    	if(!request.setCookies){
    		request.setCookies = {};
    	}
    	request.setCookies[key] = '';
    }
	request.error = text => {
		request.end(
			'Service Unavailable. Try again another time.' + (IS_DEBUG ? ' (' + text + ')' : ''),
			503,
			{
				'Content-Type': 'text/plain; charset=utf-8',
				'Srv-err': text
			}
		);
	};
	request.end = (text, code, headers, type) => {
		request.clearRequest();
		if(!code && !text){
			code = 204;
		}
		else if(!code){
			code = 200;
		}

		if(!text){
			text = '';
		}

		if(!headers){
			headers = {
				'Content-Type': 'text/html; charset=utf-8'
			};
		}

		if(type == 'bin'){
			headers['Content-Length'] = new Buffer(text, 'binary').length;
			
			response.writeHead(code, headers);
			response.end(text, 'binary');
			return;
		}

		text = text.toString().replace(new RegExp('\%\\$.*\%', 'g'), '');

		if(request.jsonpCallback){
			if(headers['Content-Type'] == 'application/json'){
				text = request.jsonpCallback + '(\'' + text + '\');';
			}
			else{
				text = request.jsonpCallback + '("' + text + '");';
			}
		}

		headers['Content-Length'] = new Buffer(text).length;
		headers['Access-Control-Allow-Origin'] = '*';

		if(request.setCookies){
			let cookies = [];
			let expires = new Date();
			expires.setDate(expires.getDate() + 5);
			for(let i in request.setCookies){
				cookies.push(i + '=' + encodeURIComponent(request.setCookies[i]) + ';expires=' + expires.toUTCString() + ';path=/');
			}
			headers['Set-Cookie'] = cookies;
		}
		
		response.writeHead(code, headers);
		response.write(text);
		response.end();
	};
	request.clearRequest = () => {
		delete request.DAL;
	};
};

exports.parsePost = (request, callback) => {
	request.post = {};
	if(!request.isPost){
		return callback();
	}

	let body = '';

	request.on('data', data => {
		body += data;

		if(body.length > 1e6){
			request.connection.destroy();
		}
	});

	request.on('end', () => {
		try{
			request.post = JSON.parse(body);
		}catch(e){
			try{
				request.post = qs.parse(body);
			}catch(ee){
				request.post = body;
			}
		}
		
		callback();
	});
};

exports.auth = (module, request) => {
	if(module.auth || module.rights){
		let header = request.headers.authorization || '';	// get the header
		let token = header.split(/\s+/).pop() || '';				// and the encoded auth token
		let auth = new Buffer(token, 'base64').toString();			// convert from base64
		let parts = auth.split(':');
		userObj.user = parts[0];
		userObj.pass = parts[0];
		userObj.auth = crypto.createHash('md5').update(auth).digest('hex');
		let moduleAuth = module.auth == 'default' ? helpers.defaultAuth : module.auth;
		if(handlerAuth !== true && handlerAuth != userObj.auth){
			return false;
		}
	}

	return true;
};
