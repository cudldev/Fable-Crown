import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE_PATH || (repo && repo !== `${owner}.github.io` ? `/${repo}/` : '/'), test: { include: ['tests/**/*.test.ts'] } } as Parameters<typeof defineConfig>[0]);
