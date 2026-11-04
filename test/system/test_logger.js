const assert=require('assert');
const rewire=require('rewire');
const sinon=require('sinon');

describe('logger',function(){
  let module,output,writes,stub;
  beforeEach(function(){module=rewire('../../system/logger');output=[];writes=[];stub=sinon.stub(console,'log').callsFake(message=>output.push(message));module.__set__('createWriteStream',file=>({write:message=>writes.push({file,message})}));});
  afterEach(()=>stub.restore());
  it('formats errors, objects, extra context and suppresses debug by default',function(){
    const logger=module('/logs',false).create('MODULE');logger.d('hidden');logger.i.call({extra:['a','b']},'hello',{x:1},new Error('failure'),null);
    assert.strictEqual(output.length,1);assert.match(output[0],/MODULE.*ab.*hello/);assert.match(output[0],/failure/);assert.match(output[0],/x: 1/);assert.strictEqual(writes[0].file,'/logs/logs.log');
  });
  it('writes debug messages and reuses a stream for the same directory',function(){
    let created=0;module.__set__('createWriteStream',()=>{created++;return {write(){}};});
    const first=module('/a',true).create('A');module('/a',true);first.d('debug');first.w.call({extra:'tag'},'warning');first.e('error');first.c('custom');
    assert.strictEqual(created,1);assert.strictEqual(output.length,4);assert.match(output[1],/tag/);
  });
  it('does not leak a previous logger file stream when file output is disabled',function(){
    module('/enabled',true).create('A').i('file');module('/disabled',true,true).create('B').i('console only');
    assert.strictEqual(writes.length,1);
  });
  it('infers caller names and handles stream write failures',function(){
    const logger=module('/logs',true).create();logger.i('inferred');assert.match(output[0],/inferred/);
    const error=sinon.stub(console,'error');try{logger.add = () => {throw Error('unused');};module.__set__('createWriteStream',()=>({write(){throw Error('disk full');}}));module('/bad',true).create('bad').i('fallback');assert(error.calledOnce);}finally{error.restore();}
    assert.strictEqual(module.__get__('getFileName')('short','x'), '???');assert.strictEqual(typeof module.__get__('getFileName')('Error\n at A (a.js:1:1)\n at B (b.js:2:2)\n at C (c.js:3:3)','a.js',true),'string');assert.strictEqual(module.__get__('ND')(3,3),'003');
  });
});
