let fs = require('fs');
let path = require('path');
try{
  let data = fs.readFileSync(path.join(__dirname, 'package.json'));
  data = data.toString();
  data = JSON.parse(data);
  let ver = Number(data.version.split('.').join(''));
  if(ver >= 100){
    console.warn('!!! Please check if your scripts are run correctly - checks of initialization variables are added due to the beginning of writing tests.');
  }
}
catch(e){}