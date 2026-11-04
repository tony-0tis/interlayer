const { createTransport } = require('nodemailer');

const log = global.logger('_SMTP EMAIL');

exports.transporter = null;
exports.init = function(sysconfig, config) {
  exports.transporter = createTransport(config);
};
exports.send = function(email, cb) {
  const pending = Promise.resolve().then(() => exports.transporter.sendMail(email));
  if(typeof cb !== 'function') return pending;
  return pending.then(info => cb(null, info), err => {
    log.e('smtp send', err);
    cb(err);
  });
};
