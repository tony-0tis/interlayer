/* globals rewire, logger, chai, describe, it, beforeEach */ 
require(process.cwd() + '/test/init');
let helpers = require(process.cwd() + '/system/utils.js');

describe('utils', () => {
  //before(()=>{  })
  //after(()=>{})
  //beforeEach(()=>{})
  //afterEach(()=>{})
  describe('generateId', ()=>{
    it('not null', () => {
      chai.assert(helpers.generateId() != null);
    });

    it('length 8 chars', ()=>{
      chai.assert.lengthOf(helpers.generateId(), 8);
    });
  });
});