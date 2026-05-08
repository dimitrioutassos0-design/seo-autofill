import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveReportFilePath } from '../src/dashboard.js';

describe('resolveReportFilePath', () => {
  it('accepts plain JSON report file names', () => {
    expect(resolveReportFilePath('./reports', 'run-store.json')).toBe(resolve(process.cwd(), './reports', 'run-store.json'));
  });

  it('rejects paths outside the report directory', () => {
    expect(resolveReportFilePath('./reports', '../config.demo.json')).toBeNull();
    expect(resolveReportFilePath('./reports', '..\\config.demo.json')).toBeNull();
  });

  it('rejects non-JSON report names', () => {
    expect(resolveReportFilePath('./reports', 'run-store.txt')).toBeNull();
  });
});
