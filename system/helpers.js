"use strict"
let ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
let ID_LENGTH = 8;
exports.generateId = () => {
  let rtn = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return rtn;
};

exports.toJson = res => {
	res.headers['Content-Type'] = 'application/json';
	res.data = JSON.stringify(res.data);
};

exports.clearObj = obj => {
	if(!obj){
		return '{}';
	}

	let clonedObject = JSON.parse(JSON.stringify(obj));
	delete clonedObject.token;
	return JSON.stringify(clonedObject);
};