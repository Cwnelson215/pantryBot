const BASE_URL = "https://world.openfoodfacts.org/api/v2/product";

interface OFFProduct {
  product_name?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number>;
  image_url?: string;
}

export interface BarcodeResult {
  found: boolean;
  name?: string;
  brand?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  imageUrl?: string;
}

const CATEGORY_MAP: Record<string, string> = {
  dairy: "Dairy",
  milk: "Dairy",
  cheese: "Dairy",
  yogurt: "Dairy",
  butter: "Dairy",
  cream: "Dairy",
  produce: "Produce",
  fruit: "Produce",
  vegetable: "Produce",
  fresh: "Produce",
  meat: "Meat & Seafood",
  beef: "Meat & Seafood",
  pork: "Meat & Seafood",
  chicken: "Meat & Seafood",
  poultry: "Meat & Seafood",
  fish: "Meat & Seafood",
  seafood: "Meat & Seafood",
  grain: "Grains & Bread",
  bread: "Grains & Bread",
  cereal: "Grains & Bread",
  pasta: "Grains & Bread",
  rice: "Grains & Bread",
  flour: "Grains & Bread",
  canned: "Canned Goods",
  frozen: "Frozen",
  spice: "Spices & Seasonings",
  seasoning: "Spices & Seasonings",
  herb: "Spices & Seasonings",
  condiment: "Condiments",
  sauce: "Condiments",
  ketchup: "Condiments",
  mustard: "Condiments",
  mayonnaise: "Condiments",
  dressing: "Condiments",
  snack: "Snacks",
  chip: "Snacks",
  cracker: "Snacks",
  cookie: "Snacks",
  candy: "Snacks",
  chocolate: "Snacks",
  beverage: "Beverages",
  drink: "Beverages",
  juice: "Beverages",
  soda: "Beverages",
  water: "Beverages",
  coffee: "Beverages",
  tea: "Beverages",
  baking: "Baking",
  sugar: "Baking",
};

const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  cl: "ml",
  fl: "oz",
};

async function doLookup(barcode: string, timeoutMs: number): Promise<BarcodeResult> {
  const url = `${BASE_URL}/${barcode}?fields=product_name,brands,quantity,categories_tags,nutriments,image_url`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "PantryBot/1.0 (https://pantrybot.cwnel.com)",
    },
  });

  if (!response.ok) {
    return { found: false };
  }

  const data = await response.json();
  if (data.status !== 1 || !data.product) {
    return { found: false };
  }

  const product: OFFProduct = data.product;
  const parsed = parseQuantity(product.quantity || "");
  const category = mapToAppCategory(product.categories_tags || []);

  let name = product.product_name || "";
  if (product.brands && name && !name.toLowerCase().includes(product.brands.toLowerCase())) {
    name = `${product.brands} ${name}`;
  }

  return {
    found: true,
    name: name || undefined,
    brand: product.brands || undefined,
    quantity: parsed.quantity,
    unit: parsed.unit,
    category,
    imageUrl: product.image_url || undefined,
  };
}

const FETCH_TIMEOUT_MS = 8000;
const HARD_DEADLINE_MS = 10000;

export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  let hardDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      doLookup(barcode, FETCH_TIMEOUT_MS),
      new Promise<never>((_, reject) => {
        hardDeadlineTimer = setTimeout(() => reject(new Error("Hard deadline exceeded")), HARD_DEADLINE_MS);
      }),
    ]);
    return result;
  } catch (err) {
    console.error("Barcode lookup failed:", err);
    return { found: false };
  } finally {
    clearTimeout(hardDeadlineTimer);
  }
}

export function mapToAppCategory(categories: string[]): string | undefined {
  for (const tag of categories) {
    const lower = tag.replace(/^en:/, "").replace(/-/g, " ").toLowerCase();
    for (const [keyword, appCategory] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(keyword)) {
        return appCategory;
      }
    }
  }
  return undefined;
}

export function parseQuantity(quantity: string): { quantity?: number; unit?: string } {
  if (!quantity) return {};

  // Match patterns like "500 g", "16 oz", "1.5 L", "500g"
  const match = quantity.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
  if (!match) return {};

  const num = parseFloat(match[1].replace(",", "."));
  const rawUnit = match[2].toLowerCase();
  const unit = UNIT_ALIASES[rawUnit];

  if (isNaN(num)) return {};

  // Convert cl to ml
  if (rawUnit === "cl" && unit === "ml") {
    return { quantity: num * 10, unit: "ml" };
  }

  return { quantity: num, unit };
}
