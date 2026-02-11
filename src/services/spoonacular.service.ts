import { config } from "../config";

function ensureApiKey() {
  if (!config.spoonacular.apiKey) {
    throw new Error("Spoonacular API key not configured");
  }
}

export async function findByIngredients(
  ingredients: string[],
  number: number = 10
) {
  ensureApiKey();

  const joined = ingredients.join(",");
  const url = `${config.spoonacular.baseUrl}/recipes/findByIngredients?apiKey=${config.spoonacular.apiKey}&ingredients=${encodeURIComponent(joined)}&number=${number}&ranking=1&ignorePantry=false`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export async function getRecipeDetails(id: number) {
  ensureApiKey();

  const url = `${config.spoonacular.baseUrl}/recipes/${id}/information?apiKey=${config.spoonacular.apiKey}&includeNutrition=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Spoonacular API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
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
