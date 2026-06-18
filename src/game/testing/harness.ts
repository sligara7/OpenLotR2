/*
 * Minimal zero-dependency test harness.
 *
 * The project has no test runner installed and the sim core must stay runnable
 * under bare `node --experimental-strip-types`. This provides just enough:
 * register tests with test(), assert with the helpers, then run() reports and
 * sets the process exit code. Each feature gets its own *.test.ts file that
 * imports these helpers; tests/run.ts imports every suite and calls run().
 */

interface Case {
  name: string;
  fn: () => void | Promise<void>;
}

const cases: Case[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'assertEqual'}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertClose(actual: number, expected: number, eps: number, msg?: string): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg ?? 'assertClose'}: expected ~${expected} (±${eps}), got ${actual}`);
  }
}

export function assertGreater(actual: number, threshold: number, msg?: string): void {
  if (!(actual > threshold)) {
    throw new Error(`${msg ?? 'assertGreater'}: expected > ${threshold}, got ${actual}`);
  }
}

export function assertLess(actual: number, threshold: number, msg?: string): void {
  if (!(actual < threshold)) {
    throw new Error(`${msg ?? 'assertLess'}: expected < ${threshold}, got ${actual}`);
  }
}

/** Run all registered cases, print a summary, set exit code. Returns failures.
 *  Supports both sync and async test functions. */
export async function run(): Promise<number> {
  let passed = 0;
  const failures: { name: string; err: unknown }[] = [];
  for (const c of cases) {
    try {
      await c.fn();
      passed += 1;
      console.log(`  ✓ ${c.name}`);
    } catch (err) {
      failures.push({ name: c.name, err });
      console.log(`  ✗ ${c.name}`);
    }
  }
  console.log(`\n${passed}/${cases.length} passed`);
  for (const f of failures) {
    console.log(`\nFAILED: ${f.name}\n  ${(f.err as Error)?.message ?? f.err}`);
  }
  if (typeof process !== 'undefined' && failures.length > 0) process.exitCode = 1;
  return failures.length;
}
