#!/usr/bin/env node
const fs = require('fs');

const src = fs.readFileSync('index.js', 'utf8');

const minified = src
  .replace(/\/\/[^\n]*/g, '')       // strip line comments
  .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
  .replace(/\s+/g, ' ')             // collapse whitespace
  .trim();

const bookmarklet = 'javascript:' + encodeURIComponent(minified);

process.stdout.write(bookmarklet + '\n');
