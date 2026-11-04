const assert=require('assert');
const fs=require('fs');
const sinon=require('sinon');

describe('postinstall',function(){
  for(const version of ['0.14.0','0.0.1',null]){
    it(`handles package version ${version} without failing installation`,function(){
      const file=require.resolve('../postinstall');const read=fs.readFileSync;const warnings=sinon.stub(console,'warn');
      const stub=sinon.stub(fs,'readFileSync').callsFake((path,...args)=>{
        if(String(path).endsWith('/package.json')){
          if(version===null)throw Error('unreadable metadata');
          return Buffer.from(JSON.stringify({version}));
        }
        return read(path,...args);
      });
      try{delete require.cache[file];require(file);assert.strictEqual(warnings.callCount,version==='0.14.0'?1:0);}
      finally{stub.restore();warnings.restore();delete require.cache[file];}
    });
  }
});
