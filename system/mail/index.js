const { statSync } = require('fs');
const { join } = require('path');

const log = global.logger('_EMAILS');

exports.init = (config)=>{
  if(!config.useEmailSenders || Object.keys(config.useEmailSenders) == 0){
    return;
  }

  const EmailSenders = {};
  const pathsToCheck = [__dirname].concat(config.emailSenders||[]).reverse();
  for(const sender in config.useEmailSenders){
    const senderName = sender + '.js';
    for(let senderPathToCheck of pathsToCheck){
      const senderPath = join(senderPathToCheck, senderName);
      try{
        if(statSync(senderPath).isFile()){
          const senderFile = require(senderPath);// eslint-disable-line global-require
          if(!senderFile.send){
            throw 'exports.send no defined';
          }

          if(!senderFile.init){
            throw 'exports.init no defined';
          }

          senderFile.init(config, config.useEmailSenders[sender]);

          EmailSenders[sender] = senderFile.send;
          Object.freeze(EmailSenders[sender]);
          break;
        }
      }catch(e){
        log.e('Error in', senderPath, e);
      }
    }
  }

  log.d('EmailSenders included', Object.keys(EmailSenders));

  Object.freeze(EmailSenders);

  return EmailSenders;
};