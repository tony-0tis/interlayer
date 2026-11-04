const path = require('path');
setTimeout(() => require('../../../index.js')({
  path: path.join(__dirname),
  modules: [path.join(__dirname, 'modules')],
  port: Number(process.env.TEST_PORT),
  workers: Number(process.env.TEST_WORKERS),
  instantShutdownDelay: Number(process.env.TEST_DELAY),
  disableLogFile: true,
  skipDbWarning: true
}), Number(process.env.TEST_START_DELAY) || 0);
