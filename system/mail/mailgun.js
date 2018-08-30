let mailgun = require('mailgun-js');
exports.client = null;

exports.init = (sysConfig, config) => {
  exports.client = mailgun(config);
};

exports.send = (email, cb) => {
  exports.client.messages().send(email, cb);
};