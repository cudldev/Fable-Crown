import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'**/*.spec.ts',workers:1,timeout:150000,use:{baseURL:process.env.DEMO_URL||'http://127.0.0.1:4174/',channel:'chrome',headless:true},reporter:'list'});
