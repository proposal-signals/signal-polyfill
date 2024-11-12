import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import JsonArrayReporter from './benchmarks/jsonArrayReporter';
import dts from 'vite-plugin-dts';

process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --expose-gc`;

const entry = join(dirname(fileURLToPath(import.meta.url)), './src/index.ts');

export default defineConfig({
  plugins: [dts()],
  build: {
    minify: false,
    lib: {
      entry,
      formats: ['es'],
      fileName: 'index',
    },
  },
  test: {
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
      reporters: ['default', new JsonArrayReporter()],
    },
  },
});
