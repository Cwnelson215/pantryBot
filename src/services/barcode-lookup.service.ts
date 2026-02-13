import * as openfoodfacts from "./openfoodfacts.service";
import { BarcodeResult, mapToAppCategory, parseQuantity } from "./openfoodfacts.service";
import { lookupByBarcode as usdaLookupByBarcode, USDABrandedFood } from "./usda.service";

const HARD_DEADLINE_MS = 10000;

export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  const start = Date.now();

  try {
    const offResult = await openfoodfacts.lookupBarcode(barcode);
    if (offResult.found) {
      return offResult;
    }

    const elapsed = Date.now() - start;
    const remaining = HARD_DEADLINE_MS - elapsed;

    if (remaining < 1000) {
      return { found: false };
    }

    const usdaFood = await usdaLookupByBarcode(barcode, remaining);
    if (usdaFood) {
      return mapUSDAToResult(usdaFood);
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

function mapUSDAToResult(food: USDABrandedFood): BarcodeResult {
  let name = food.description || "";
  const brand = food.brandOwner || food.brandName || undefined;

  if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) {
    name = `${brand} ${name}`;
  }

  const parsed = parseServingSize(food);
  const category = food.brandedFoodCategory
    ? mapToAppCategory([food.brandedFoodCategory])
    : undefined;

  return {
    found: true,
    name: name || undefined,
    brand,
    quantity: parsed.quantity,
    unit: parsed.unit,
    category,
  };
}

function parseServingSize(food: USDABrandedFood): { quantity?: number; unit?: string } {
  if (food.householdServingFullText) {
    const parsed = parseQuantity(food.householdServingFullText);
    if (parsed.quantity !== undefined) {
      return parsed;
    }
  }

  if (food.servingSize != null && food.servingSizeUnit) {
    const parsed = parseQuantity(`${food.servingSize} ${food.servingSizeUnit}`);
    if (parsed.quantity !== undefined) {
      return parsed;
    }
  }

  return {};
}
