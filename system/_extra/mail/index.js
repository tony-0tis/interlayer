let fs = require('fs');
let path = require('path');
let log = global.logger.create('EMAILS');

exports.init = (paths, config)=>{
  if(!config.useEmailSenders || Object.keys(config.useEmailSenders) == 0){
    return;
  }

  let EmailSenders = {};
  let pathsToCheck = [__dirname].concat(paths.useEmailSenders||[]).reverse();
  for(let sender in config.useEmailSenders){
    let senderName = sender + '.js';
    for(let senderPathToCheck of pathsToCheck){
      let senderPath = path.join(senderPathToCheck, senderName);
      try{
        if(fs.statSync(senderPath).isFile()){
          let senderFile = require(senderPath);// eslint-disable-line global-require
          if(!senderFile.send){
            throw 'exports.send no defined';
          }
          if(!senderFile.init){
            throw 'exports.init no defined';
          }
          senderFile.init(config, config.useEmailSenders[sender]);

          EmailSenders[sender] = senderFile.send;
          senderFile = undefined;
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