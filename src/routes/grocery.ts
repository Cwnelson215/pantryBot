import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import { db } from "../db/client";
import { savedRecipes } from "../db/schema";
import { eq } from "drizzle-orm";
import * as pantryService from "../services/pantry.service";
import * as groceryService from "../services/grocery.service";
import * as spoonacularService from "../services/spoonacular.service";

const router = Router();

router.use(requireAuth);

// List all grocery lists
router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const lists = await groceryService.getLists(userId);

  res.render("pages/grocery/index", {
    title: "Grocery Lists",
    lists,
  });
});

// Recipe selection page
router.get("/new", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const userSavedRecipes = await db
      .select()
      .from(savedRecipes)
      .where(eq(savedRecipes.userId, userId));

    const pantryItems = await pantryService.getItems(userId);
    const ingredientNames = pantryItems.map((item) => item.name);

    let suggestedRecipes: any[] = [];
    try {
      if (ingredientNames.length > 0) {
        suggestedRecipes = await spoonacularService.findByIngredients(
          ingredientNames
        );
        // Sort by usedIngredientCount descending
        suggestedRecipes.sort(
          (a: any, b: any) =>
            (b.usedIngredientCount || 0) - (a.usedIngredientCount || 0)
        );
      }
    } catch {
      // Spoonacular API failure — still render page without suggestions
    }

    res.render("pages/grocery/select-recipes", {
      title: "Create Grocery List",
      savedRecipes: userSavedRecipes,
      suggestedRecipes,
    });
  } catch {
    setFlash(req, "error", "Failed to load recipes");
    res.redirect("/grocery");
  }
});

// Generate grocery list from selected recipes
router.post("/generate", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  const savedIds: string[] = Array.isArray(req.body.savedRecipes)
    ? req.body.savedRecipes
    : req.body.savedRecipes
      ? [req.body.savedRecipes]
      : [];

  const spoonacularIds: string[] = Array.isArray(req.body.spoonacularRecipes)
    ? req.body.spoonacularRecipes
    : req.body.spoonacularRecipes
      ? [req.body.spoonacularRecipes]
      : [];

  if (savedIds.length === 0 && spoonacularIds.length === 0) {
    setFlash(req, "error", "Please select at least one recipe");
    return res.redirect("/grocery/new");
  }

  try {
    const pantryItems = await pantryService.getItems(userId);

    const allMissing: {
      name: string;
      amount?: string;
      unit?: string;
      sourceRecipeTitle?: string;
    }[] = [];
    const allPartial: {
      ingredientName: string;
      pantryItemName: string;
      amount?: string;
      unit?: string;
      sourceRecipeTitle?: string;
    }[] = [];
    const recipeNames: string[] = [];

    // Process saved recipes
    for (const idStr of savedIds) {
      const id = parseInt(idStr);
      const recipes = await db
        .select()
        .from(savedRecipes)
        .where(eq(savedRecipes.id, id));

      if (recipes.length === 0) continue;

      const recipe = recipes[0];
      recipeNames.push(recipe.title);

      const ingredients = (recipe.ingredientsJson as any[]) || [];
      const classified = groceryService.classifyIngredients(
        ingredients,
        pantryItems
      );

      for (const ing of classified.missing) {
        allMissing.push({
          name: ing.name || ing.original || "Unknown",
          amount: ing.amount?.toString(),
          unit: ing.unit,
          sourceRecipeTitle: recipe.title,
        });
      }

      for (const p of classified.partial) {
        allPartial.push({
          ingredientName: p.ingredient.name || p.ingredient.original || "Unknown",
          pantryItemName: p.pantryItemName,
          amount: p.ingredient.amount?.toString(),
          unit: p.ingredient.unit,
          sourceRecipeTitle: recipe.title,
        });
      }
    }

    // Process Spoonacular recipes
    for (const idStr of spoonacularIds) {
      const id = parseInt(idStr);
      const details = await spoonacularService.getRecipeDetails(id);

      recipeNames.push(details.title);

      const ingredients = details.extendedIngredients || [];
      const classified = groceryService.classifyIngredients(
        ingredients,
        pantryItems
      );

      for (const ing of classified.missing) {
        allMissing.push({
          name: ing.name || ing.original || "Unknown",
          amount: ing.amount?.toString(),
          unit: ing.unit,
          sourceRecipeTitle: details.title,
        });
      }

      for (const p of classified.partial) {
        allPartial.push({
          ingredientName: p.ingredient.name || p.ingredient.original || "Unknown",
          pantryItemName: p.pantryItemName,
          amount: p.ingredient.amount?.toString(),
          unit: p.ingredient.unit,
          sourceRecipeTitle: details.title,
        });
      }
    }

    // Deduplicate
    const deduplicatedMissing = groceryService.deduplicateItems(allMissing);
    const listName = recipeNames.join(", ");

    if (allPartial.length > 0) {
      // Show confirmation page
      res.render("pages/grocery/confirm", {
        title: "Confirm Grocery List",
        missing: deduplicatedMissing,
        partial: allPartial,
        listName,
      });
    } else {
      // No partial matches — create list directly
      const list = await groceryService.createList(userId, listName);
      await groceryService.addItems(list.id, deduplicatedMissing);
      res.redirect(`/grocery/${list.id}`);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate grocery list";
    setFlash(req, "error", message);
    res.redirect("/grocery/new");
  }
});

// Confirm partial matches and create list
router.post("/confirm", async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const listName = req.body.listName || "Grocery List";

    // Parse missing items from hidden fields
    let missingItems: {
      name: string;
      amount?: string;
      unit?: string;
      sourceRecipeTitle?: string;
    }[] = [];
    try {
      missingItems = JSON.parse(req.body.missingItems || "[]");
    } catch {
      missingItems = [];
    }

    // Get confirmed partial items (checkboxes)
    const confirmedPartials: string[] = Array.isArray(req.body.confirmedPartials)
      ? req.body.confirmedPartials
      : req.body.confirmedPartials
        ? [req.body.confirmedPartials]
        : [];

    // Parse partial items data
    let partialItems: {
      ingredientName: string;
      amount?: string;
      unit?: string;
      sourceRecipeTitle?: string;
    }[] = [];
    try {
      partialItems = JSON.parse(req.body.partialItems || "[]");
    } catch {
      partialItems = [];
    }

    // Add confirmed partials to the items list
    const confirmedSet = new Set(confirmedPartials);
    for (const partial of partialItems) {
      if (confirmedSet.has(partial.ingredientName)) {
        missingItems.push({
          name: partial.ingredientName,
          amount: partial.amount,
          unit: partial.unit,
          sourceRecipeTitle: partial.sourceRecipeTitle,
        });
      }
    }

    const list = await groceryService.createList(userId, listName);
    await groceryService.addItems(list.id, missingItems);

    res.redirect(`/grocery/${list.id}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create grocery list";
    setFlash(req, "error", message);
    res.redirect("/grocery");
  }
});

// View/edit a grocery list
router.get("/:id", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);

  if (isNaN(id)) return res.redirect("/grocery");

  const list = await groceryService.getList(id, userId);
  if (!list) {
    setFlash(req, "error", "Grocery list not found");
    return res.redirect("/grocery");
  }

  const items = await groceryService.getListItems(id);

  res.render("pages/grocery/detail", {
    title: list.name,
    list,
    items,
  });
});

// Add custom item
router.post("/:id/add-item", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);

  const list = await groceryService.getList(id, userId);
  if (!list) {
    setFlash(req, "error", "Grocery list not found");
    return res.redirect("/grocery");
  }

  const { name, amount, unit } = req.body;
  if (!name) {
    setFlash(req, "error", "Item name is required");
    return res.redirect(`/grocery/${id}`);
  }

  await groceryService.addCustomItem(id, name, amount, unit);
  setFlash(req, "success", "Item added");
  res.redirect(`/grocery/${id}`);
});

// Toggle item checked state
router.post("/:id/items/:itemId/toggle", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);
  const itemId = parseInt(req.params.itemId as string);

  const list = await groceryService.getList(id, userId);
  if (!list) {
    setFlash(req, "error", "Grocery list not found");
    return res.redirect("/grocery");
  }

  await groceryService.toggleItem(itemId, id);
  res.redirect(`/grocery/${id}`);
});

// Delete item
router.post("/:id/items/:itemId/delete", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);
  const itemId = parseInt(req.params.itemId as string);

  const list = await groceryService.getList(id, userId);
  if (!list) {
    setFlash(req, "error", "Grocery list not found");
    return res.redirect("/grocery");
  }

  await groceryService.removeItem(itemId, id);
  setFlash(req, "success", "Item removed");
  res.redirect(`/grocery/${id}`);
});

// Delete entire list
router.post("/:id/delete", async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id as string);

  await groceryService.deleteList(id, userId);
  setFlash(req, "success", "Grocery list deleted");
  res.redirect("/grocery");
});

export default router;
