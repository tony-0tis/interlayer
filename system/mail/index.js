"use strict"
let fs = require('fs');
let path = require('path');
let log = global.logger.create('EMAILS');

exports.init = (paths, config) => {
	if(!config.emails || Object.keys(config.emails) == 0){
		return;
	}

	let EmailSenders = {};
	let pathsToCheck = [__dirname].concat(paths.emails||[]).reverse();
	for(let sender in config.emails){
		let senderName = sender + '.js';
		for(let senderPath of pathsToCheck){
			try{
				if(fs.statSync(path.join(senderPath, senderName)).isFile()){
					let senderFile = require(path.join(senderPath, senderName));// eslint-disable-line global-require
					if(!senderFile.send){
						throw 'exports.send no defined';
					}
					if(!senderFile.init){
						throw 'exports.init no defined';
					}
					senderFile.init(config, config.emails[sender]);

					EmailSenders[sender] = senderFile.send;
					senderFile = undefined;
					Object.freeze(EmailSenders[sender]);
					break;
				}
			}catch(e){
				log.e('Error in', path.join(senderPath, senderName), e);
			}
		}
	}

	log.d('EmailSenders included', Object.keys(EmailSenders));

	Object.freeze(EmailSenders);

	return EmailSenders;
};