const fs = require('fs');
const path = require('path');
const os = require('os');
exports.sandbox = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interlayer-test-'));
  return {root, write(name, text){const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, text); return file;},
    close(){for(const file of Object.keys(require.cache)) if(file.startsWith(root + path.sep)) delete require.cache[file]; fs.rmSync(root,{recursive:true,force:true});}};
};
exports.log = () => ({i(){},d(){},w(){},e(){},add(){}});
