const { createWriteStream } = require('fs');
const { inspect } = require('util');
const { relative } = require('path');

const colors = {
  I: 32,
  E: 31,
  D: 36,
  W: 33,
  C: 37
};
const breaker = /^win/.test(process.platform) ? '' : '\n';
const streams = {};
let logFile;

module.exports = (dir, debug, disableLogFile)=>{
  if(!disableLogFile){
    if(streams[dir]){
      logFile = streams[dir];
    }
    else{
      logFile = createWriteStream(dir + '/logs.log');
      streams[dir] = logFile;
    }
  }

  return {
    create(name){
      name = typeof name == 'string' ? name : '';

      const createPath = !name ? new Error().stack.split('\n')[2].match(/.*\((.*):\d+:\d+\)/)[1] : '';
      const log = {
        add(str){
          try{
            if(logFile){
              logFile.write(str);
            }
            console.log(str);
          }catch(e){
            console.error(e);
            console.log(str);
          }
        }
      };

      for(const type in colors){
        log[type.toLowerCase()] = function(...args){
          if(!name){
            name = getFileName(new Error().stack, createPath, this.logModifed);
          }

          if(type == 'D' && !debug){
            return;
          }

          args = split(args);

          let str = logData() + '[' + type + '][' + process.pid + '][' + name + ']';
          if(this.extra){
            if(typeof this.extra === 'string') str += this.extra;
            if(Array.isArray(this.extra)) str += this.extra.join('');
          }
          str += ' ' + args;
          str = '\x1b[37;' + colors[type] + ';1m' + str + '\x1b[0m' + breaker;
          log.add(str);
        };
      }
      
      return log;
    }
  };
};
exports.create = exports;

function getFileName(stack, createPath, isModifed){
  const file = stack.split('\n');
  if(!file[2]){
    return '???';
  }

  let fPath = file[2].match(/.*\((.*):\d+:\d+\)/)[1];
  if(isModifed){
    fPath = file[3].match(/.*\((.*):\d+:\d+\)/)[1];
  }

  return relative(createPath, fPath).replace(/(\.\.[\\/])+/, '');
}

function split(obj, del = ' '){
  const str = [];
  
  for(let data of obj){
    if(data == null){
      continue;
    }
    
    if(typeof data == 'object' && !data.stack){
      try{
        data = inspect(data);
      }catch(e){
        //
      }
    }
    
    if(data != null && data.stack){
      data = data.stack;
    }
    
    str.push(data);
  }
  
  return str.join(del);
}

function logData(){
  const d = new Date();
  return `[${d.getFullYear()}/${ND(d.getMonth() + 1)}/${ND(d.getDate())}|${ND(d.getHours())}:${ND(d.getMinutes())}:${ND(d.getSeconds())}.${ND(d.getMilliseconds(), 3)}|${(d.getTimezoneOffset() / 60)}]`;
}

function ND(num, length = 2){
  num = String(num);
  
  while(num.length < length){
    num = '0' + num;
  }
  
  return num;
}