/**
 * Alias entry point for validating a persisted `DesignDocument`.
 *
 * A `DesignPlan` is a `DesignDocument` (see `schema/types.ts`), so this delegates
 * to `validateDesignPlan` rather than maintaining a second validator. It exists
 * so call sites that are validating a *saved document* read that way, without
 * forking the rules.
 */

import { validateDesignPlan, type DesignPlanValidationReport, type ValidatePlanOptions } from './design-plan.ts';
import type { DesignDocument } from '../schema/types.ts';

export function validateDesignDocument(
  input: unknown,
  options: ValidatePlanOptions = {},
): DesignPlanValidationReport & { readonly value: DesignDocument | undefined } {
  const report = validateDesignPlan(input, options);
  return Object.freeze({ ...report, value: report.result.value });
}
