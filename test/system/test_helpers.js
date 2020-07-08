require(process.cwd() + '/test/init');
let helpers = require(process.cwd() + '/system/_extra/index');

describe('helpers', () => {
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
    })
  });

  describe('toJson', ()=>{
    let res = {
      data: {},
      headers: {}
    };

    it('toJson the string', ()=>{
      res.data = 'null';
      helpers.toJson(res);
      chai.assert(res.data == '"null"', 'res.data is not equal ' + res.data);
      chai.assert(res.headers['Content-Type'] == 'application/json', 'res.headers different ' + res.headers);
    });

    it('toJson the Object', ()=>{
      res.data = {good: true};
      helpers.toJson(res);
      chai.assert(res.data == '{"good":true}');
      chai.assert(res.headers['Content-Type'] == 'application/json');
    });
  });
});