const nodemailer = require("nodemailer");
exports.transporter = null;
let log = global.logger.create('SMTP EMAIL');

exports.init = function(sysconfig, config) {
  exports.transporter = nodemailer.createTransport(config);
};
exports.send = async function(email, cb) {
  let info = await exports.transporter.sendMail(email).catch(e=>log.e('smtp send', e));
  cb(null, info);
};