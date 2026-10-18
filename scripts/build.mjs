import { build, context } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  outfile: 'dist/bilibili-multi-account.user.js',
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox102'],
  charset: 'utf8',
  minify: false,
  legalComments: 'inline',
  loader: { '.css': 'text' },
  plugins: [
    {
      name: 'userscript-metadata',
      setup(builder) {
        builder.onLoad({ filter: /[/\\]src[/\\]main\.js$/ }, async ({ path: filename }) => ({
          contents: await readFile(filename, 'utf8'),
          loader: 'js',
          watchFiles: [path.join(root, 'userscript.meta.js'), path.join(root, 'package.json')],
        }));
        builder.onEnd(async (result) => {
          if (result.errors.length) return;
          const meta = await readFile(path.join(root, 'userscript.meta.js'), 'utf8');
          const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
          const version = manifest.version.replace(/\.0$/, '');
          const banner = meta.replace(/^(\/\/ @version\s+).*$/m, `$1${version}`).trim();
          await mkdir(path.join(root, 'dist'), { recursive: true });
          await writeFile(result.outputFiles[0].path, banner + '\n\n' + result.outputFiles[0].text);
          console.log('Built dist/bilibili-multi-account.user.js');
        });
      },
    },
  ],
};

if (process.argv.includes('--watch')) {
  const watcher = await context(options);
  await watcher.watch();
  console.log('Watching source and userscript metadata. Press Ctrl+C to stop.');
  process.on('SIGINT', async () => {
    await watcher.dispose();
    process.exit(0);
  });
} else {
  await build(options);
}
