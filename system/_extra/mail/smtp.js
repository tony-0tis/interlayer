const nodemailer = require("nodemailer");
exports.client = null;

exports.init = function(sysconfig, config) {
  exports.client = nodemailer.createTransport(config);
};
exports.send = async function(email, cb) {
  let info = await transporter.sendMail(email).catch(e=>console.error(e));
  cb(null, info);
};