// Per-user limit on mutating server actions, enforced in Postgres by kk_rate_hit() (migration 0006).
//
// Sizing: Isi Pantas records one payment per action, strictly one after another, so its rate is bounded by
// the action latency: measured 10.8 actions/s sequentially (p50 87 ms, 4 round trips each) from a laptop
// to the Neon branch. A 40-item bulk fill therefore needs 40 hits in under 4 s. 600 per minute is 10 per
// second sustained: a treasurer can bulk fill hundreds of members in a minute and never see this, while a
// runaway client loop is cut off at a rate the database can carry.
export const MUTATION_LIMIT = { scope: "mutation", limit: 600, windowSeconds: 60 } as const;

export type RateLimit = { scope: string; limit: number; windowSeconds: number };
