import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

const entry = join(dirname(fileURLToPath(import.meta.url)), './src/index.ts');

export default defineConfig({
  plugins: [dts()],
  build: {
    minify: false,
    target: 'es2022',
    lib: {
      entry,
      formats: ['es'],
      fileName: 'index',
    },
  },
});
