import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * Navigation integrity.
 *
 * Runs the audit script and fails on any internal link that cannot resolve —
 * including a literal path shadowed by a dynamic segment, which looks fine to a
 * naive existence check but renders a detail page for a record that cannot
 * exist. Dead controls are invisible until someone clicks them, so this guards
 * against regression rather than relying on manual sweeps.
 */
test.describe('internal links', () => {
  test('no href or router.push target 404s', () => {
    const repoRoot = resolve(__dirname, '../../..');
    let output = '';
    let failed = false;
    try {
      output = execFileSync('python3', ['scripts/audit-navigation.py'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      });
    } catch (err) {
      failed = true;
      output = String((err as { stdout?: string }).stdout ?? err);
    }

    expect(output, output).toContain('BROKEN            : 0');
    expect(output).not.toContain('SHADOWED BY A DYNAMIC ROUTE');
    expect(failed, output).toBe(false);
  });
});
