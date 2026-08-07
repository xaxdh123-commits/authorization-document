import { hasSafeE2EBase, notRun, runPlaywright } from './safe-playwright-runner.mjs';

const browserEndpoints = ['CHROME_CURRENT_EXECUTABLE','CHROME_PREVIOUS_EXECUTABLE','ANDROID_CHROME_CURRENT_WS_ENDPOINT','ANDROID_CHROME_PREVIOUS_WS_ENDPOINT'];
if (!hasSafeE2EBase() || browserEndpoints.some(name => !process.env[name]?.trim())) notRun('The signed four-browser matrix environment is not configured');
runPlaywright(['--config', 'browser-matrix.config.ts']);
