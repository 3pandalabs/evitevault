// How the template picker labels and orders the occasion filters. The keys are
// the `category` values seeded in api/src/db/seed.ts — keep the two in step
// when adding an occasion.
//
// The order is roughly how often an Indian host reaches for each: weddings and
// the events around them first, work events last. A category not listed here
// still appears in the filter row (title-cased, after these), so a host-created
// template with an unknown category is never invisible.
export const CATEGORY_LABELS: Record<string, string> = {
  wedding: "Wedding",
  baby: "Baby shower",
  birthday: "Birthday",
  festival: "Festival & puja",
  housewarming: "Housewarming",
  party: "Party",
  business: "Business",
  general: "Anything else",
};

const ORDER = Object.keys(CATEGORY_LABELS);

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Known categories in their curated order, then any others alphabetically. */
export function sortCategories(keys: Iterable<string>): string[] {
  const present = [...new Set(keys)];
  const known = ORDER.filter((k) => present.includes(k));
  const unknown = present.filter((k) => !ORDER.includes(k)).sort();
  return [...known, ...unknown];
}
