const { createTransport } = require('nodemailer');

const log = global.logger.create('_SMTP EMAIL');

exports.transporter = null;
exports.init = function(sysconfig, config) {
  exports.transporter = createTransport(config);
};
exports.send = async function(email, cb) {
  const info = await exports.transporter.sendMail(email).catch(e=>log.e('smtp send', e));
  cb(null, info);
};