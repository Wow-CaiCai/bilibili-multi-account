const { buildSync } = require('esbuild');
const path = require('node:path');

module.exports = function bundle(contents) {
  return buildSync({
    stdin: { contents, resolveDir: path.resolve(__dirname, '../..'), loader: 'js' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    loader: { '.css': 'text' },
  }).outputFiles[0].text;
};
