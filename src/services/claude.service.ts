import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { config } from "../config";
import { createCache, TTL } from "./cache";

const generateRecipeCache = createCache<GeneratedRecipe>({ max: 100, ttl: TTL.SHORT });

function getClient(): Anthropic {
  if (!config.anthropic.apiKey) {
    throw new Error("Anthropic API key not configured");
  }
  return new Anthropic({ apiKey: config.anthropic.apiKey });
}

interface RecipeInput {
  title: string;
  ingredients: string[];
  instructions: string;
}

interface UserPreferences {
  dietaryTags?: string[];
  allergies?: string[];
  cuisinePrefs?: string[];
  servingSize?: number;
}

interface GeneratedRecipe {
  title: string;
  servings: number;
  readyInMinutes: number;
  ingredients: { name: string; amount: string; unit: string }[];
  instructions: string[];
  rawResponse: string;
}

export async function personalizeRecipe(
  recipe: RecipeInput,
  pantryItems: string[],
  preferences: UserPreferences
): Promise<string> {
  const client = getClient();

  const systemPrompt = `You are a helpful cooking assistant. Please personalize recipes based on the user's available ingredients and preferences.

Adapt recipes to:
1. Use available pantry items where possible as substitutions
2. Respect all dietary restrictions and allergies
3. Adjust serving size if specified
4. Suggest any helpful modifications or tips

Provide the personalized recipe with updated ingredients and instructions.`;

  const userPrompt = `**Original Recipe:**
- Title: ${recipe.title}
- Ingredients: ${recipe.ingredients.join(", ")}
- Instructions: ${recipe.instructions}

**Available Pantry Items:**
${pantryItems.join(", ")}

**User Preferences:**
${preferences.dietaryTags?.length ? `- Dietary restrictions: ${preferences.dietaryTags.join(", ")}` : ""}
${preferences.allergies?.length ? `- Allergies: ${preferences.allergies.join(", ")}` : ""}
${preferences.cuisinePrefs?.length ? `- Cuisine preferences: ${preferences.cuisinePrefs.join(", ")}` : ""}
${preferences.servingSize ? `- Serving size: ${preferences.servingSize}` : ""}`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

export async function generateRecipe(
  ingredients: string[],
  preferences: UserPreferences
): Promise<GeneratedRecipe> {
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ ingredients: ingredients.sort(), preferences }))
    .digest("hex");
  const cached = generateRecipeCache.get(cacheKey);
  if (cached) return cached;

  const client = getClient();

  const systemPrompt = `You are a creative chef. Create original recipes using the provided ingredients and respecting user preferences.

Return the recipe in the following JSON format (and nothing else outside the JSON):
{
  "title": "Recipe Title",
  "servings": 4,
  "readyInMinutes": 30,
  "ingredients": [
    { "name": "ingredient name", "amount": "1", "unit": "cup" }
  ],
  "instructions": [
    "Step 1 description",
    "Step 2 description"
  ]
}

Use only valid JSON. Do not include any text before or after the JSON.`;

  const userPrompt = `**Available Ingredients:**
${ingredients.join(", ")}

**User Preferences:**
${preferences.dietaryTags?.length ? `- Dietary restrictions: ${preferences.dietaryTags.join(", ")}` : ""}
${preferences.allergies?.length ? `- Allergies: ${preferences.allergies.join(", ")}` : ""}
${preferences.cuisinePrefs?.length ? `- Cuisine preferences: ${preferences.cuisinePrefs.join(", ")}` : ""}
${preferences.servingSize ? `- Serving size: ${preferences.servingSize}` : ""}`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  const rawResponse = textBlock?.text || "";

  // Extract JSON from the response (handle potential markdown code blocks)
  let jsonStr = rawResponse;
  const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  const result: GeneratedRecipe = {
    title: parsed.title,
    servings: parsed.servings,
    readyInMinutes: parsed.readyInMinutes,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    rawResponse,
  };
  generateRecipeCache.set(cacheKey, result);
  return result;
}
