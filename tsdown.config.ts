import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/entry.ts'],
  format: 'esm',
  outExtensions: () => ({ js: '.js' }),
  clean: true,
})
