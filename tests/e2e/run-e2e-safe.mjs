import { hasSafeE2EBase, notRun, runPlaywright } from './safe-playwright-runner.mjs';

if (!hasSafeE2EBase()) notRun('Dedicated _test database, E2E API, and H5 URL are required; no external system was contacted');
runPlaywright(['--config', 'playwright.config.ts']);
