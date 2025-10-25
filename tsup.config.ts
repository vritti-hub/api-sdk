import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],

  // Output formats
  format: ['cjs', 'esm'],

  // Generate .d.ts files
  dts: true,

  // Clean output directory before build
  clean: true,

  // Source maps for debugging
  sourcemap: true,

  // Minify in production
  minify: process.env.NODE_ENV === 'production',

  // Target Node version
  target: 'node18',

  // Output directory
  outDir: 'dist',

  // Handle node protocol imports
  shims: true,

  // Split code for better tree-shaking (for ESM)
  splitting: false,

  // Skip node_modules bundling
  skipNodeModulesBundle: true,

  // Keep names (for debugging)
  keepNames: true,
});
