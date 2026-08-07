import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCapture } from './run-and-capture.mjs';

test('successful skipped work is NOT_RUN, never PASS', () => {
  assert.equal(classifyCapture(0, 'GATE_STATUS=NOT_RUN\nintegration: database absent'), 'NOT_RUN');
  assert.equal(classifyCapture(0, '{"status":"NOT_RUN","reason":"database absent"}'), 'NOT_RUN');
  assert.equal(classifyCapture(0, '1 skipped'), 'PASS');
  assert.equal(classifyCapture(0, '27 passed | 3 skipped'), 'PASS');
  assert.equal(classifyCapture(0, 'fatal task is NOT_RUN maybe'), 'PASS');
  assert.equal(classifyCapture(0, 'DRY_RUN no deployment changed'), 'PASS');
});
test('only executed success is PASS', () => {
  assert.equal(classifyCapture(0, '12 tests passed'), 'PASS');
  assert.equal(classifyCapture(1, 'failed'), 'FAIL');
});
test('nonzero commands are always failures even if their text mentions NOT_RUN',()=>{
  assert.equal(classifyCapture(1,'GATE_STATUS=NOT_RUN'), 'FAIL');
  assert.equal(classifyCapture(1,'fatal browser matrix is NOT_RUN'), 'FAIL');
});
