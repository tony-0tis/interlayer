let mailgun = require('mailgun-js');
let sender = null;

exports.init = (sysConfig, config) => {
	sender = mailgun(config);
};

exports.send = (email, cb) => {
	sender.messages().send(data, cb);
};