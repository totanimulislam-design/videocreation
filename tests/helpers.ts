/** Shared test helpers. */

import type { ValidationError, ValidationWarning } from '../src/core/diagnostics.ts';
import type { DesignPlanValidationReport } from '../src/validation/design-plan.ts';

/** True when some diagnostic carries `code`. */
export function hasCode(diagnostics: readonly (ValidationError | ValidationWarning)[], code: string): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

/** Returns the diagnostic with `code`, failing the test with a helpful message when absent. */
export function findDiagnostic(
  diagnostics: readonly (ValidationError | ValidationWarning)[],
  code: string,
): ValidationError | ValidationWarning | undefined {
  return diagnostics.find((diagnostic) => diagnostic.code === code);
}

/** Asserts admission and returns the validated value. */
export function expectAdmitted(report: DesignPlanValidationReport): NonNullable<DesignPlanValidationReport['result']['value']> {
  if (!report.admitted || !report.result.value) {
    const lines = report.result.errors.map((error) => `${error.code} @ ${error.path}: ${error.message}`).join('\n');
    throw new Error(`Expected the plan to be admitted, but it was rejected:\n${lines}`);
  }
  return report.result.value;
}

/** Deep clone through JSON so tests cannot mutate shared fixtures. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Narrow helper for structured-clone style mutation in tests. */
export function mutate<T>(value: T, change: (draft: Record<string, unknown>) => void): unknown {
  const copy = clone(value) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}
