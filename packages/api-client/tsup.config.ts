import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Bundle @shop/shared-types inline so consumers need only this one package
  noExternal: ['@shop/shared-types'],
});
