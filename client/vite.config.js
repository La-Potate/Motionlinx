import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Vite 8 (Rolldown / oxc) does NOT treat .js as JSX by default. CRA did.
// We explicitly tell oxc to parse .js files as JSX so existing components keep working
// during the gradual migration to .jsx / .tsx.
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      include: ['**/*.{js,jsx,ts,tsx}'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'build',
    // Source maps were shipping in the production image (96 .map files, each
    // referenced from its bundle), handing the full original client source to
    // anyone who asked for it. Set VITE_SOURCEMAP=1 for a local debugging build.
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 1024,
  },
  oxc: {
    jsx: { runtime: 'automatic' },
  },
});
