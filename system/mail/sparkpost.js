var SparkPost = require('sparkpost');
let sender = null;

exports.init = (sysConfig, config) => {
	sender = new SparkPost(config.apiKey);
};

exports.send = (email, cb) => {
	sender.transmissions.send({
		content: {
			from: email.from,
			subject: email.subject,
			text: email.text || undefined,
			html: email.html || undefined
		},
		recipients: [{address: email.to}]
	})
	.then(data => {
		cb(null, data);
	})
	.catch(err => {
		cb(err);
	});
};