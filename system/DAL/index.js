const { statSync } = require('fs');
const { join } = require('path');

const log = global.logger('_DAL');

exports.init = (paths, config)=>{
  if(!config.useDals){
    return;
  }
  
  const DALs = {};

  let useDals = config.useDals;
  if(typeof config.useDals && !Array.isArray(config.useDals)){
    useDals = Object.keys(config.useDals);
  }
  
  const pathsToCheck = [__dirname].concat(paths.dals||[]).reverse();
  for(const dal of useDals){
    const dalName = dal + '.js';
    for(let dalsPath of pathsToCheck){
      try{
        if(statSync(join(dalsPath, dalName)).isFile()){
          const dalFile = require(join(dalsPath, dalName));// eslint-disable-line global-require
          if(!dalFile.methods){
            throw 'exports.methods no defined';
          }
  
          if(dalFile.init){
            dalFile.init(config, config.useDals[dal]);
          }
  
          DALs[dal] = dalFile.methods;
          Object.freeze(DALs[dal]);
          break;
        }
      }catch(e){
        log.e('Error in', join(dalsPath, dalName), e);
      }
    }
  }

  if(Object.keys(DALs).length){
    log.d('DALs included', Object.keys(DALs));
  }
  else{
    log.d('DALs not included');
  }

  Object.freeze(DALs);

  return DALs;
};