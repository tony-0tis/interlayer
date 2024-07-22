# Changelog

### 0.13.4
 * fix init redis with new version of module
 * refactor code - readabily 

### 0.13.2
 * added `config.disableLogFile` and `server.disableLogFile` - disable to write log file, the console.log and others continues to be written by the console

### 0.13.0

 * README tidying - added links to headings
 * code refactoring - now more or less every function is in the corresponding file
 * fix `server.loadConfigFile` - external file was not loaded correctly
 * added `config.startInits` and `server.setStartInits` - option to disable the start of initializers - previously, it ran for every instance
 * added `config.formidableOptions` and `server.setFormidableOptions` - now you can specify what Formidable should parse
 * added possibility of parsing any method if headers['content-type'] is not null
 * added ability to create logger with `global.logger(tagName)`
 * change - cluster worker std now sends to cluster master process(even uncaughtException)

### 0.12.5

 * fix to start the function of the `global.intervals`

### 0.12.4

 * fix to start message sniffing for worker

### 0.12.3

 * fix to start wiretapping - now only for the server
 * fix README
 * fix - `request.getView` and `request.getViewSync` now read files in utf8 encoding
 * added - pseudocron format for `global.intervals`

### 0.12.2

 * fix SMTP init - `config.useEmailSenders`

### 0.12.1

 * fix README

### 0.12.0

 * fix graceful shutdown
 * added SMTP -`config.useEmailSenders`

### 0.11.1

 * fix request path - added decodeURIComponent step

### 0.11.0

 * added `config.skipParsePost` and `server.setSkipParsePost` - option to disable parse POST method data

### 0.10.11

 * fix `module.setInit` added function type check

### 0.10.10

 * fix - hide pingpong log behind non-public `config.pingponglog`

### 0.10.9

 * fix error on start and stop `global.intervals` - missing modified log

### 0.10.6

 * bad commit(

### 0.10.5

 * fix cluster rewatch dir on watched file change if `config.restartOnChange`

### 0.10.5

 * fix tests and `server[\*methods]` errors

### 0.10.0

 * fix some `server[\*methods]` errors and init
 * added `server.getConfig()`
 * added some tests
 * deprecate `server.setUseFilesAsHTTPErrors`

### 0.9.0

 * fix cluster initialization
 * added `config.websocket` and `server.setWebsocketConfig` to start websocket
 * added `config.noDelay`, `server.setNoDelay` and `methodMeta.noDelay` to disable/enable Nagle algoritm for all connections
 * added `config.useHttpErrorFiles` and `server.setUseFilesAsHTTPErrors` [see 0.9.0 readme](https://github.com/tony-0tis/interlayer/tree/v0.9.0)
 * added `request.getRequest` to return the original request
 * added `request.files` to access to object of uploaded files
 * code refactoring
 * deprecate `server.setDisableNagleAlgoritm` and `methodMeta.disableNagleAlgoritm`

...
