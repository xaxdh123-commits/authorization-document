import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({ base: process.env.VITE_PUBLIC_BASE ?? (command === 'build' ? '/admin/' : '/'), plugins: [react()], test: { globals: true, environment: 'jsdom', setupFiles: './src/test/setup.ts' } }));
