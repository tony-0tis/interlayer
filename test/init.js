if(!global.logger) global.logger = require(process.cwd() + '/system/logger')(process.cwd() + '/test', false, true).create;
if(!global.chai) global.chai = require('chai');
if(!global.rewire) global.rewire = require('rewire');