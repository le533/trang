'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'public');
const staticDirectories = ['assets', 'components', 'css', 'data', 'js', 'pages'];

fs.mkdirSync(outputDirectory, { recursive: true });

for (const directory of staticDirectories) {
  const source = path.join(projectRoot, directory);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required static directory: ${source}`);
  }
  fs.cpSync(source, path.join(outputDirectory, directory), { recursive: true });
}

fs.copyFileSync(
  path.join(projectRoot, 'index.html'),
  path.join(outputDirectory, 'index.html'),
);

const pdfjsBuild = path.join(projectRoot, 'backend', 'node_modules', 'pdfjs-dist', 'build');
if (!fs.existsSync(pdfjsBuild)) {
  throw new Error('PDF.js is missing. Install backend dependencies before building.');
}

fs.mkdirSync(path.join(outputDirectory, 'vendor'), { recursive: true });
fs.cpSync(pdfjsBuild, path.join(outputDirectory, 'vendor', 'pdfjs'), { recursive: true });
