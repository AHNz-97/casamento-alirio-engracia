import { build } from 'esbuild';
await build({ entryPoints: ['dist/server/index.js'], outfile: 'dist/server/index.js', bundle: true, allowOverwrite: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, loader: { '.html': 'text' } });
await build({ entryPoints: ['client/inharrime-admin.js'], outfile: 'dist/client/inharrime-admin.js', bundle: true, platform: 'browser', target: 'es2022', minify: true });
await build({ entryPoints: ['client/badges-admin.js'], outfile: 'dist/client/badges-admin.js', bundle: true, platform: 'browser', target: 'es2022', minify: true });
await build({ entryPoints: ['client/protocol.js'], outfile: 'dist/client/protocol.js', bundle: true, platform: 'browser', target: 'es2022', minify: true });
