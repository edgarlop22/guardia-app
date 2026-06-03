import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const swapLandingPlugin = {
  name: 'swap-landing',
  writeBundle() {
    const dist = path.resolve(__dirname, 'dist');
    // React app: index.html → app.html
    if (fs.existsSync(`${dist}/index.html`)) {
      fs.copyFileSync(`${dist}/index.html`, `${dist}/app.html`);
    }
    // Landing: landing.html → index.html (becomes root)
    const landingSrc = path.resolve(__dirname, 'landing.html');
    if (fs.existsSync(landingSrc)) {
      fs.copyFileSync(landingSrc, `${dist}/index.html`);
    }
    console.log('✓ landing.html → dist/index.html');
    console.log('✓ React app  → dist/app.html');
  }
};

export default defineConfig({
  plugins: [react(), swapLandingPlugin],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'lucide': ['lucide-react'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
