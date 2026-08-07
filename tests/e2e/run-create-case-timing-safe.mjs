import { hasSafeE2EBase, notRun, runPlaywright } from './safe-playwright-runner.mjs';

const requirementIds = process.env.E2E_TIMING_REQUIREMENT_VERSION_IDS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
if (!hasSafeE2EBase() || !process.env.E2E_ADMIN_TOKEN || !process.env.E2E_TIMING_TEMPLATE_VERSION_ID || requirementIds.length !== 3) {
  notRun('Dedicated timing fixture requires _test DB/API/H5, admin token, template version, and exactly three requirement versions');
}
runPlaywright(['--config', 'playwright.config.ts', 'create-case-timing.spec.ts']);
