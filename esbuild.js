const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const production = process.argv.includes('--minify');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node16',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  if (watch) {
    createWasmDirAndCopy();
    await ctx.watch();
    console.log('watching...');
  } else {
    createWasmDirAndCopy();
    await ctx.rebuild();
    await ctx.dispose();
    console.log('build complete.');
  }
}

function createWasmDirAndCopy() {
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy tree-sitter.wasm
  const treeSitterWasmSrc = path.join(__dirname, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm');
  const treeSitterWasmDest = path.join(distDir, 'tree-sitter.wasm');
  if (fs.existsSync(treeSitterWasmSrc)) {
    fs.copyFileSync(treeSitterWasmSrc, treeSitterWasmDest);
    console.log('Copied tree-sitter.wasm');
  } else {
    console.warn('Could not find tree-sitter.wasm at ' + treeSitterWasmSrc);
  }

  // Copy python and javascript grammars
  const pyWasmSrc = path.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-python.wasm');
  const pyWasmDest = path.join(distDir, 'tree-sitter-python.wasm');
  if (fs.existsSync(pyWasmSrc)) {
    fs.copyFileSync(pyWasmSrc, pyWasmDest);
    console.log('Copied tree-sitter-python.wasm');
  } else {
    console.warn('Could not find tree-sitter-python.wasm at ' + pyWasmSrc);
  }

  const jsWasmSrc = path.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-javascript.wasm');
  const jsWasmDest = path.join(distDir, 'tree-sitter-javascript.wasm');
  if (fs.existsSync(jsWasmSrc)) {
    fs.copyFileSync(jsWasmSrc, jsWasmDest);
    console.log('Copied tree-sitter-javascript.wasm');
  } else {
    console.warn('Could not find tree-sitter-javascript.wasm at ' + jsWasmSrc);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
