// Shared comparison logic for previews and server-side validation.
// Normalize case, punctuation and repeated whitespace without stripping legal suffixes.
export function normalizedRecordName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/['’.,]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type ExistingClient = {
  id: string;
  name: string;
};

export type ExistingOrganization = {
  id: string;
  legal_name: string;
  entity_npi: string | null;
  client_id: string | null;
};

export function matchingClient(
  records: ExistingClient[],
  name: string,
  excludeId?: string,
): ExistingClient | undefined {
  const key = normalizedRecordName(name);
  if (!key) return undefined;
  return records.find((record) =>
    record.id !== excludeId && normalizedRecordName(record.name) === key
  );
}

export function matchingOrganization(
  records: ExistingOrganization[],
  name: string,
  npi: string,
): { record: ExistingOrganization; reason: "npi" | "name" } | undefined {
  const trimmedNpi = npi.trim();
  const key = normalizedRecordName(name);
  if (trimmedNpi) {
    const byNpi = records.find((record) =>
      record.entity_npi !== null && record.entity_npi === trimmedNpi
    );
    if (byNpi) return { record: byNpi, reason: "npi" };
  }
  if (!key) return undefined;
  const byName = records.find((record) => normalizedRecordName(record.legal_name) === key);
  return byName ? { record: byName, reason: "name" } : undefined;
}
