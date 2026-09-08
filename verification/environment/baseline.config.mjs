import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serve captured original code for matching-camera comparisons without reverting user files.
export default defineConfig({
  plugins: [{
    name: 'captured-environment-baseline', enforce: 'pre',
    load(id) {
      if (id.replaceAll('\\', '/').endsWith('/src/game/track.ts')) return readFileSync(new URL('./track.before.ts.txt', import.meta.url), 'utf8');
      if (!id.replaceAll('\\', '/').endsWith('/src/RaceScene.tsx')) return;
      const baseline = readFileSync(new URL('./RaceScene.before.tsx.txt', import.meta.url), 'utf8');
      const current = readFileSync(new URL('../../src/RaceScene.tsx', import.meta.url), 'utf8');
      const start = current.indexOf('    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("environmentInspect"))');
      const end = current.indexOf('    if (now - game.lastHudAt', start);
      return baseline.replace('    updateCamera(camera, game.cars[0], dt);', '    updateCamera(camera, game.cars[0], dt);\n' + current.slice(start, end));
    }
  }, react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true }
});
