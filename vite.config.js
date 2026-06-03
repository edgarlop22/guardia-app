import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Plugin to copy landing.html to dist
const copyLandingPlugin = {
  name: 'copy-landing',
  writeBundle() {
    const landingPath = path.resolve(__dirname, 'landing.html');
    const distPath = path.resolve(__dirname, 'dist', 'landing.html');
    if (fs.existsSync(landingPath)) {
      fs.copyFileSync(landingPath, distPath);
      console.log('✓ landing.html copied to dist/');
    }
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyLandingPlugin],
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
    host: true, // Listen on all addresses to allow device testing on LAN
    port: 5173,
    strictPort: true,
  },
});
