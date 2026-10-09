import { normalizedRecordName } from "@/lib/record-duplicates";

export type ReviewCandidate = {
  id: string;
  name: string;
  npi?: string | null;
};

export type DuplicateGroup<T extends ReviewCandidate> = {
  id: string;
  records: T[];
  reasons: Array<"name" | "npi">;
};

// Build transitive review groups: A shares a name with B, and B shares an
// NPI with C means all three need a single human review. Never imply a merge.
export function findDuplicateGroups<T extends ReviewCandidate>(
  records: T[],
  includeNpi: boolean,
): DuplicateGroup<T>[] {
  const parents = records.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const unite = (left: number, right: number) => {
    const first = find(left);
    const second = find(right);
    if (first !== second) parents[second] = first;
  };

  const byName = new Map<string, number>();
  const byNpi = new Map<string, number>();
  records.forEach((record, index) => {
    const nameKey = normalizedRecordName(record.name);
    if (nameKey) {
      const known = byName.get(nameKey);
      if (known === undefined) byName.set(nameKey, index);
      else unite(known, index);
    }
    const npi = includeNpi ? record.npi?.trim() : null;
    if (npi) {
      const known = byNpi.get(npi);
      if (known === undefined) byNpi.set(npi, index);
      else unite(known, index);
    }
  });

  const clusters = new Map<number, T[]>();
  records.forEach((record, index) => {
    const root = find(index);
    const existing = clusters.get(root) ?? [];
    existing.push(record);
    clusters.set(root, existing);
  });

  return [...clusters.values()]
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => {
      const nameCounts = new Map<string, number>();
      const npiCounts = new Map<string, number>();
      for (const item of cluster) {
        const nameKey = normalizedRecordName(item.name);
        if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
        if (includeNpi && item.npi?.trim()) {
          const npi = item.npi.trim();
          npiCounts.set(npi, (npiCounts.get(npi) ?? 0) + 1);
        }
      }
      const reasons: Array<"name" | "npi"> = [];
      if ([...nameCounts.values()].some((count) => count > 1)) reasons.push("name");
      if ([...npiCounts.values()].some((count) => count > 1)) reasons.push("npi");
      const sorted = cluster.slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return { id: sorted.map((item) => item.id).join("-"), records: sorted, reasons };
    })
    .sort((a, b) => a.records[0].name.localeCompare(b.records[0].name));
}
