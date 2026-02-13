import { config } from "../config";

function ensureApiKey() {
  if (!config.usda.apiKey) {
    throw new Error("USDA API key not configured");
  }
}

export async function searchFoods(query: string, pageSize: number = 10) {
  ensureApiKey();

  const url = `${config.usda.baseUrl}/foods/search?api_key=${config.usda.apiKey}&query=${encodeURIComponent(query)}&pageSize=${pageSize}&dataType=Foundation,SR%20Legacy`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `USDA API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.foods;
}

export async function getFoodDetails(fdcId: string) {
  ensureApiKey();

  const url = `${config.usda.baseUrl}/food/${fdcId}?api_key=${config.usda.apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `USDA API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export interface NutrientInfo {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  ironMg: number | null;
  calciumMg: number | null;
  vitaminDMcg: number | null;
  potassiumMg: number | null;
  vitaminCMg: number | null;
}

const NUTRIENT_MAP: Record<string, keyof NutrientInfo> = {
  Energy: "calories",
  Protein: "proteinG",
  "Carbohydrate, by difference": "carbsG",
  "Total lipid (fat)": "fatG",
  "Fiber, total dietary": "fiberG",
  "Sugars, total including NLEA": "sugarG",
  "Sugars, Total": "sugarG",
  "Sodium, Na": "sodiumMg",
  "Iron, Fe": "ironMg",
  "Calcium, Ca": "calciumMg",
  "Vitamin D (D2 + D3)": "vitaminDMcg",
  "Potassium, K": "potassiumMg",
  "Vitamin C, total ascorbic acid": "vitaminCMg",
};

export async function getNutrients(fdcId: string): Promise<NutrientInfo> {
  const food = await getFoodDetails(fdcId);

  const nutrients: NutrientInfo = {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    ironMg: null,
    calciumMg: null,
    vitaminDMcg: null,
    potassiumMg: null,
    vitaminCMg: null,
  };

  if (!food.foodNutrients || !Array.isArray(food.foodNutrients)) {
    return nutrients;
  }

  for (const fn of food.foodNutrients) {
    const name = fn.nutrient?.name || fn.name;
    const amount = fn.amount;

    if (name && amount !== undefined) {
      const key = NUTRIENT_MAP[name];
      if (key && nutrients[key] === null) {
        nutrients[key] = amount;
      }
    }
  }

  return nutrients;
}

export function extractNutrientsFromSearchResult(food: any): NutrientInfo {
  const nutrients: NutrientInfo = {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    ironMg: null,
    calciumMg: null,
    vitaminDMcg: null,
    potassiumMg: null,
    vitaminCMg: null,
  };

  if (!food.foodNutrients || !Array.isArray(food.foodNutrients)) {
    return nutrients;
  }

  for (const fn of food.foodNutrients) {
    // Search endpoint uses nutrientName/value; detail endpoint uses nutrient.name/amount
    const name = fn.nutrientName || fn.nutrient?.name || fn.name;
    const amount = fn.value ?? fn.amount;

    if (name && amount !== undefined) {
      const key = NUTRIENT_MAP[name];
      if (key && nutrients[key] === null) {
        nutrients[key] = amount;
      }
    }
  }

  return nutrients;
}
