import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import { db } from "../db/client";
import { savedRecipes, userPreferences } from "../db/schema";
import { eq } from "drizzle-orm";
import * as pantryService from "../services/pantry.service";
import * as spoonacularService from "../services/spoonacular.service";
import * as claudeService from "../services/claude.service";

const router = Router();

router.use(requireAuth);

router.get("/", (_req: Request, res: Response) => {
  res.render("pages/recipes/index", { title: "Recipes" });
});

router.get("/search", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const pantryItems = await pantryService.getItems(userId);
    const ingredientNames = pantryItems.map((item) => item.name);
    const recipes = await spoonacularService.findByIngredients(ingredientNames);

    res.render("pages/recipes/search", {
      title: "Recipe Search",
      recipes,
      pantryItems,
    });
  } catch {
    setFlash(req, "error", "Recipe search is unavailable. Please check API configuration.");
    res.render("pages/recipes/search", {
      title: "Recipe Search",
      recipes: [],
      pantryItems: [],
    });
  }
});

router.get("/saved", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  const recipes = await db
    .select()
    .from(savedRecipes)
    .where(eq(savedRecipes.userId, userId));

  res.render("pages/recipes/saved", {
    title: "Saved Recipes",
    recipes,
  });
});

router.get("/generate", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const pantryItems = await pantryService.getItems(userId);

  res.render("pages/recipes/generate", {
    title: "Generate Recipe",
    pantryItems,
  });
});

router.post("/generate", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const ingredients: string[] = Array.isArray(req.body.ingredients)
      ? req.body.ingredients
      : req.body.ingredients
        ? [req.body.ingredients]
        : [];

    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    const preferences = prefs.length > 0 ? prefs[0] : {};

    const recipe = await claudeService.generateRecipe(ingredients, preferences);

    res.render("pages/recipes/detail", {
      title: recipe.title,
      recipe,
      source: "claude",
      isGenerated: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate recipe";
    setFlash(req, "error", message);
    res.redirect("/recipes/generate");
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.redirect("/recipes");

  try {
    const recipe = await spoonacularService.getRecipeDetails(id);

    res.render("pages/recipes/detail", {
      title: recipe.title,
      recipe,
      source: "spoonacular",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load recipe";
    setFlash(req, "error", message);
    res.redirect("/recipes");
  }
});

router.post("/:id/personalize", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.redirect("/recipes");

  try {
    const recipe = await spoonacularService.getRecipeDetails(id);
    const pantryItems = await pantryService.getItems(userId);
    const pantryNames = pantryItems.map((item) => item.name);

    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    const preferences = prefs.length > 0 ? prefs[0] : {};

    const personalization = await claudeService.personalizeRecipe(
      recipe,
      pantryNames,
      preferences
    );

    res.render("pages/recipes/detail", {
      title: recipe.title,
      recipe,
      personalization,
      source: "spoonacular",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to personalize recipe";
    setFlash(req, "error", message);
    res.redirect(`/recipes/${id}`);
  }
});

router.post("/save", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  const {
    title,
    spoonacularId,
    source,
    ingredientsJson,
    instructionsJson,
    personalization,
    servings,
    readyInMinutes,
    imageUrl,
    nutritionJson,
  } = req.body;

  await db.insert(savedRecipes).values({
    userId,
    title,
    spoonacularId: spoonacularId ? parseInt(spoonacularId) : null,
    source: source || null,
    ingredientsJson: ingredientsJson ? JSON.parse(ingredientsJson) : null,
    instructionsJson: instructionsJson ? JSON.parse(instructionsJson) : null,
    personalization: personalization || null,
    servings: servings ? parseInt(servings) : null,
    readyInMinutes: readyInMinutes ? parseInt(readyInMinutes) : null,
    imageUrl: imageUrl || null,
    nutritionJson: nutritionJson ? JSON.parse(nutritionJson) : null,
  });

  setFlash(req, "success", "Recipe saved!");
  res.redirect("/recipes/saved");
});

export default router;
