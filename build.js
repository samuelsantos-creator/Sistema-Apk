const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, '.build', 'dist');

// Folders and files to copy
const itemsToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'assets',
  'icons',
  'api',
  'colaboradores.js',
  'motivos.js',
  'ops.js',
  'produtos.js',
  'recursos.js',
  'zink-data.js'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

itemsToCopy.forEach(item => {
  const srcItem = path.join(srcDir, item);
  const destItem = path.join(destDir, item);
  if (fs.existsSync(srcItem)) {
    console.log('Copying ' + item);
    copyRecursiveSync(srcItem, destItem);
  }
});

console.log('Build completed! Files copied to .build/dist');
