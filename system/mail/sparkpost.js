const SparkPost = require('sparkpost');

exports.client = null;

exports.init = (sysConfig, config)=>{
  exports.client = new SparkPost(config.apiKey);
};

exports.send = (email, cb)=>{
  const pending = Promise.resolve().then(() => exports.client.transmissions.send({
    content: {
      from: email.from,
      subject: email.subject,
      text: email.text || undefined,
      html: email.html || undefined
    },
    recipients: [{address: email.to}]
  }));
  if(typeof cb !== 'function') return pending;
  return pending.then(data => cb(null, data), err => cb(err));
};