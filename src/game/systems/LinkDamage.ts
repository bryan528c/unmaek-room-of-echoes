export interface LinkTarget {
  id: string;
  alive: boolean;
}

export interface DistributedDamage {
  targetId: string;
  amount: number;
  propagated: boolean;
}

export function distributeLinkedDamage(
  sourceId: string,
  amount: number,
  targets: readonly LinkTarget[],
  shareRatio: number,
  propagated = false,
): DistributedDamage[] {
  const result: DistributedDamage[] = [{ targetId: sourceId, amount, propagated }];
  if (propagated) return result;
  const distributed = new Set<string>([sourceId]);
  for (const target of targets) {
    if (!target.alive || distributed.has(target.id)) continue;
    distributed.add(target.id);
    result.push({ targetId: target.id, amount: amount * shareRatio, propagated: true });
  }
  return result;
}
