import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    reporter: [['list']],
    timeout: 420000,
    workers: 1,
    retries: 0,
});
