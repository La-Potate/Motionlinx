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
    sourcemap: true,
    chunkSizeWarningLimit: 1024,
  },
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  optimizeDeps: {
    rolldownOptions: {
      jsx: { mode: 'preserve' },
    },
  },
});
