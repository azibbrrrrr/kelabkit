// Which database is a restore pointed at? The restore script refuses production unless told
// otherwise. Production is recognised by its Neon compute endpoint (the first host label, with
// the "-pooler" suffix removed, so the pooled and direct strings of one branch compare equal).

export function endpointOf(connectionString: string): string | null {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return host.split(".")[0].replace(/-pooler$/, "") || null;
  } catch {
    return null;
  }
}

export type TargetVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Fails closed: an unparseable target, or no known production string to compare with, is a refusal
 * (we cannot prove the target is not production). `allowProduction` is the explicit override.
 */
export function checkRestoreTarget(target: string, productionUrls: (string | undefined)[], allowProduction: boolean): TargetVerdict {
  const targetEndpoint = endpointOf(target);
  if (!targetEndpoint) return { ok: false, reason: "The target connection string could not be parsed." };
  const known = productionUrls.filter((u): u is string => Boolean(u?.trim())).map(endpointOf);
  if (known.some((e) => e === targetEndpoint)) {
    return allowProduction ? { ok: true } : { ok: false, reason: "The target is the production database. Pass --i-know-this-is-production to restore into it." };
  }
  if (known.length === 0 && !allowProduction) {
    return { ok: false, reason: "Cannot tell whether the target is production: the production connection strings are not set to compare with." };
  }
  return { ok: true };
}
