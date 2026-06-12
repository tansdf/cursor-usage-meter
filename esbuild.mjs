import { copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const rootDir = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const wasmSource = join(rootDir, 'node_modules/sql.js/dist/sql-wasm.wasm');
const wasmTarget = join(rootDir, 'dist/sql-wasm.wasm');

function copyWasm() {
  copyFileSync(wasmSource, wasmTarget);
}

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-sql-wasm',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            copyWasm();
          }
        });
      },
    },
  ],
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching...');
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
