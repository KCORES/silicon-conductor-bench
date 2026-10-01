import path from 'node:path';
import sirv from 'sirv';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: 4173,
    open: false,
  },
  resolve: {
    alias: {
      module: path.resolve(__dirname, 'src/module'),
    },
  },
  plugins: [
    {
      name: 'serve-infinitown-static',
      configureServer(server) {
        for (const dir of ['assets', 'textures', 'css']) {
          server.middlewares.use(`/${dir}`, sirv(path.resolve(dir), { dev: true, etag: true }));
        }
      },
      configurePreviewServer(server) {
        for (const dir of ['assets', 'textures', 'css']) {
          server.middlewares.use(`/${dir}`, sirv(path.resolve(dir), { dev: true, etag: true }));
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
    copyPublicDir: false,
  },
});
