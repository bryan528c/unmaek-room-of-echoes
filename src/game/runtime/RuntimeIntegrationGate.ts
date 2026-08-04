/**
 * Sequential integration gate. Raise this value only after the preceding
 * runtime-contract and Act verification gates have passed.
 */
export const INTEGRATED_SUBMISSION_ACTS = 3 as number;

export const isSubmissionActIntegrated = (act: number): boolean => (
  Number.isInteger(act) && act >= 1 && act <= INTEGRATED_SUBMISSION_ACTS
);
