if(!global.logger) global.logger = require(process.cwd() + '/system/_extra/_logger')(process.cwd() + '/test');
if(!global.chai) global.chai = require('chai');
if(!global.rewire) global.rewire = require("rewire");