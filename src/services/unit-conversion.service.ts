// ── Unit Conversion Service ──────────────────────────────────────────────────

type UnitGroup = "volume" | "weight" | "count";

interface UnitDef {
  group: UnitGroup;
  toBase: number; // multiply by this to get base unit (ml for volume, g for weight)
}

const UNIT_MAP: Record<string, UnitDef> = {
  // Volume (base: ml)
  tsp: { group: "volume", toBase: 4.929 },
  tbsp: { group: "volume", toBase: 14.787 },
  "fl oz": { group: "volume", toBase: 29.574 },
  cup: { group: "volume", toBase: 236.588 },
  ml: { group: "volume", toBase: 1 },
  l: { group: "volume", toBase: 1000 },

  // Weight (base: g)
  g: { group: "weight", toBase: 1 },
  kg: { group: "weight", toBase: 1000 },
  oz: { group: "weight", toBase: 28.3495 },
  lb: { group: "weight", toBase: 453.592 },

  // Count (no cross-conversion)
  piece: { group: "count", toBase: 1 },
  each: { group: "count", toBase: 1 },
  bunch: { group: "count", toBase: 1 },
  can: { group: "count", toBase: 1 },
  bag: { group: "count", toBase: 1 },
  box: { group: "count", toBase: 1 },
  bottle: { group: "count", toBase: 1 },
  jar: { group: "count", toBase: 1 },
};

const ALIASES: Record<string, string> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cups: "cup",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  pieces: "piece",
  bunches: "bunch",
  cans: "can",
  bags: "bag",
  boxes: "box",
  bottles: "bottle",
  jars: "jar",
};

function normalize(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return ALIASES[lower] || lower;
}

/**
 * Try to convert an amount from one unit to another.
 * Returns the converted amount, or null if the units are incompatible.
 */
export function tryConvert(
  amount: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);

  // Same unit after normalization
  if (from === to) return amount;

  const fromDef = UNIT_MAP[from];
  const toDef = UNIT_MAP[to];

  if (!fromDef || !toDef) return null;
  if (fromDef.group !== toDef.group) return null;

  // Count units don't cross-convert between different count types
  if (fromDef.group === "count" && from !== to) return null;

  // Convert: fromUnit -> base -> toUnit
  const baseAmount = amount * fromDef.toBase;
  return baseAmount / toDef.toBase;
}
