import { defineConfig, devices } from '@playwright/test';

const chrome = (name: string, executablePath: string | undefined) => ({ name, use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : undefined } });
const android = (name: string, wsEndpoint: string | undefined) => ({ name, use: { ...devices['Pixel 7'], connectOptions: wsEndpoint ? { wsEndpoint } : undefined } });

export default defineConfig({
  testDir: '.',
  testMatch: ['browser-persistence.spec.ts'],
  workers: 1,
  projects: [
    chrome('desktop-chrome-current', process.env.CHROME_CURRENT_EXECUTABLE),
    chrome('desktop-chrome-previous', process.env.CHROME_PREVIOUS_EXECUTABLE),
    android('android-chrome-current', process.env.ANDROID_CHROME_CURRENT_WS_ENDPOINT),
    android('android-chrome-previous', process.env.ANDROID_CHROME_PREVIOUS_WS_ENDPOINT),
  ],
  reporter: [['list']],
});
