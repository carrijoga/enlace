import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const localEnvFile = new URL('./.env', import.meta.url);
if (existsSync(localEnvFile)) loadEnvFile(localEnvFile);

export default defineConfig({
  plugins: [
    sveltekit({ adapter: process.env.ENLACE_PREVIEW_BUILD === '1' ? undefined : adapter() }),
  ],
});
