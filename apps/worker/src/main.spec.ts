import { afterEach, describe, expect, it } from 'vitest';
import { assertPdfWorkerRuntimeConfig } from './main.js';

describe('worker production runtime pinning', () => {
  const previous = { nodeEnv: process.env.NODE_ENV, executable: process.env.CHROMIUM_EXECUTABLE_PATH, major: process.env.CHROMIUM_EXPECTED_MAJOR };
  afterEach(() => {
    if(previous.nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.nodeEnv;
    if(previous.executable===undefined)delete process.env.CHROMIUM_EXECUTABLE_PATH;else process.env.CHROMIUM_EXECUTABLE_PATH=previous.executable;
    if(previous.major===undefined)delete process.env.CHROMIUM_EXPECTED_MAJOR;else process.env.CHROMIUM_EXPECTED_MAJOR=previous.major;
  });
  it('fails before bootstrap when production Chrome major is not pinned', () => {
    process.env.NODE_ENV='production';process.env.CHROMIUM_EXECUTABLE_PATH='chrome';delete process.env.CHROMIUM_EXPECTED_MAJOR;
    expect(()=>assertPdfWorkerRuntimeConfig()).toThrow('CHROMIUM_EXPECTED_MAJOR_NOT_CONFIGURED');
  });
  it('accepts an explicit executable and major in production', () => {
    process.env.NODE_ENV='production';process.env.CHROMIUM_EXECUTABLE_PATH='chrome';process.env.CHROMIUM_EXPECTED_MAJOR='140';
    expect(()=>assertPdfWorkerRuntimeConfig()).not.toThrow();
  });
});
