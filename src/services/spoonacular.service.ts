import { config } from "../config";
import { createCache, TTL } from "./cache";

const findByIngredientsCache = createCache<any>({ max: 200, ttl: TTL.SHORT });
const recipeDetailsCache = createCache<any>({ max: 500, ttl: TTL.LONG });

function ensureApiKey() {
  if (!config.spoonacular.apiKey) {
    throw new Error("Spoonacular API key not configured");
  }
}

export async function findByIngredients(
  ingredients: string[],
  number: number = 50
) {
  ensureApiKey();

  const cacheKey = `${ingredients.sort().join(",")}:${number}`;
  const cached = findByIngredientsCache.get(cacheKey);
  if (cached) return cached;

  const joined = ingredients.join(",");
  const url = `${config.spoonacular.baseUrl}/recipes/findByIngredients?apiKey=${config.spoonacular.apiKey}&ingredients=${encodeURIComponent(joined)}&number=${number}&ranking=1&ignorePantry=false`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  findByIngredientsCache.set(cacheKey, data);
  return data;
}

export async function getRecipeDetails(id: number) {
  ensureApiKey();

  const cacheKey = String(id);
  const cached = recipeDetailsCache.get(cacheKey);
  if (cached) return cached;

  const url = `${config.spoonacular.baseUrl}/recipes/${id}/information?apiKey=${config.spoonacular.apiKey}&includeNutrition=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  recipeDetailsCache.set(cacheKey, data);
  return data;
}

export async function getRandomRecipes(
  tags?: string[],
  number: number = 10
) {
  ensureApiKey();

  let url = `${config.spoonacular.baseUrl}/recipes/random?apiKey=${config.spoonacular.apiKey}&number=${number}`;

  if (tags && tags.length > 0) {
    url += `&tags=${encodeURIComponent(tags.join(","))}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.recipes;
}

export async function searchRecipes(
  query: string,
  options?: { diet?: string; cuisine?: string; number?: number }
) {
  ensureApiKey();

  const number = options?.number || 10;
  let url = `${config.spoonacular.baseUrl}/recipes/complexSearch?apiKey=${config.spoonacular.apiKey}&query=${encodeURIComponent(query)}&number=${number}&addRecipeInformation=true&fillIngredients=true`;

  if (options?.diet) {
    url += `&diet=${encodeURIComponent(options.diet)}`;
  }

  if (options?.cuisine) {
    url += `&cuisine=${encodeURIComponent(options.cuisine)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
