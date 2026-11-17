// Prototype switches (Settings → Prototype options). They let you see every
// screen state on a real phone: no AI plan, empty lists, errors, offline.
// Phase 4 removes this file; the real API decides these states.

export type PrototypeOptions = {
  /** Treat every school as Essential (no AI): the Ask tab disappears. */
  essentialPlan: boolean;
  /** The school used all its assistant questions this month. */
  askQuotaReached: boolean;
  /** Every list comes back empty. */
  emptyData: boolean;
  /** Every request fails, to show error states. */
  failRequests: boolean;
  /** Show the offline banner and serve only cached data. */
  offline: boolean;
  /** Ask for a two-step code when signing in. */
  requireTwoStep: boolean;
};

export const defaultPrototypeOptions: PrototypeOptions = {
  essentialPlan: false,
  askQuotaReached: false,
  emptyData: false,
  failRequests: false,
  offline: false,
  requireTwoStep: true,
};

let current: PrototypeOptions = { ...defaultPrototypeOptions };

export function getPrototypeOptions(): PrototypeOptions {
  return current;
}

export function setPrototypeOptions(next: PrototypeOptions): void {
  current = next;
}
