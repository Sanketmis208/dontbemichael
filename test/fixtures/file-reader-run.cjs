'use strict';
// Runs the attached file reader (src/main/fileReader.ts) under plain Node, as
// the app runs fileReaderCli.js under Electron: `<max bytes> <path>`.
const loadTs = require('../load-ts.cjs');
loadTs('src/main/fileReader.ts').readerMain(process.argv.slice(2));
