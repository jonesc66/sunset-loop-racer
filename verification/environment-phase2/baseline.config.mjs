import { readFileSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read captured pre-Phase-2 modules without changing working source.
export default defineConfig({
  plugins: [{ name: 'phase2-captured-baseline', enforce: 'pre', load(id) {
    const normalized=id.replaceAll('\\','/');
    const suffix=normalized.split('/src/')[1];
    if(!suffix)return;
    const relative=suffix.startsWith('game/')?suffix.slice(5):suffix;
    const file=new URL('./baseline/'+relative,import.meta.url);
    if(existsSync(file))return readFileSync(file,'utf8');
  }},react()],
  server: {host:'127.0.0.1',port:5174,strictPort:true,watch:{ignored:['**/.edge-*-profile/**']}}
});
