var SparkPost = require('sparkpost');
exports.client = null;

exports.init = (sysConfig, config) => {
  exports.client = new SparkPost(config.apiKey);
};

exports.send = (email, cb) => {
  exports.client.transmissions.send({
    content: {
      from: email.from,
      subject: email.subject,
      text: email.text || undefined,
      html: email.html || undefined
    },
    recipients: [{address: email.to}]
  }).then(data => {
    cb(null, data);
  }).catch(err => {
    cb(err);
  });
};