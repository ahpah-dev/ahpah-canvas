// Shared by the browser and local bridge so slow completions have the same budget.
export const COMPLETION_TIMEOUT_MS = 180_000;
export const CATALOG_TIMEOUT_MS = 15_000;
export const AUTO_FREE_FIRST_ANSWER_MS = 30_000;
export const COMPLETION_TIMEOUT_MESSAGE =
  "The model did not finish within 3 minutes. Try a shorter prompt or choose another model. Any partial answer has been kept.";
