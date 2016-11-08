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
			html: email.text || email.html
		},
		recipients: [email.to]
	})
	.then(data => {
		cb(null, data);
	})
	.catch(err => {
		cb(err);
	});
};