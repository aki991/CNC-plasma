import { defineConfig } from '@playwright/test';
const testPort = 4174;
const baseURL = 'http://localhost:' + testPort;
export default defineConfig({
  testDir: './tests/e2e', timeout: 60_000, fullyParallel: true, workers: 2,
  use: { channel: 'chrome', baseURL, viewport: { width: 1920, height: 1080 },
    locale: 'sr-Latn-RS', timezoneId: 'Europe/Belgrade', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port ' + testPort, url: baseURL },
});
