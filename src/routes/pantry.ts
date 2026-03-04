import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import * as pantryService from "../services/pantry.service";
import * as barcodeLookup from "../services/barcode-lookup.service";
import * as usdaService from "../services/usda.service";

const CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Grains & Bread",
  "Canned Goods",
  "Frozen",
  "Spices & Seasonings",
  "Condiments",
  "Snacks",
  "Beverages",
  "Baking",
  "Other",
];

const UNITS = [
  "",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "L",
  "cup",
  "tbsp",
  "tsp",
  "piece",
  "bunch",
  "can",
  "bag",
  "box",
  "bottle",
  "jar",
];

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const items = await pantryService.getItems(userId);

    res.render("pages/pantry/index", {
      title: "My Pantry",
      items,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/add", (_req, res) => {
  res.render("pages/pantry/add", {
    title: "Add Pantry Item",
    categories: CATEGORIES,
    units: UNITS,
  });
});

router.get("/lookup-barcode/:barcode", async (req, res) => {
  const barcode = req.params.barcode;

  if (!/^\d{8,14}$/.test(barcode)) {
    return res.status(400).json({ error: "Invalid barcode format. Must be 8-14 digits." });
  }

  const routeTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Barcode lookup timed out" });
    }
  }, 12000);

  try {
    const result = await barcodeLookup.lookupBarcode(barcode);
    if (!res.headersSent) {
      res.json(result);
    }
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to look up barcode" });
    }
  } finally {
    clearTimeout(routeTimeout);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      setFlash(req, "error", "Invalid item ID");
      return res.redirect("/pantry");
    }

    const item = await pantryService.getItem(id, userId);

    if (!item) {
      setFlash(req, "error", "Item not found");
      return res.redirect("/pantry");
    }

    let nutrients: usdaService.NutrientInfo | null = null;
    try {
      if (item.usdaFdcId) {
        nutrients = await usdaService.getNutrients(item.usdaFdcId);
      } else {
        const results = await usdaService.searchFoods(item.name, 1);
        if (results && results.length > 0) {
          nutrients = usdaService.extractNutrientsFromSearchResult(results[0]);
        }
      }
    } catch {
      // Nutrition lookup failed — page will render without nutrition data
    }

    res.render("pages/pantry/show", {
      title: item.name,
      item,
      nutrients,
    });
  } catch (err) {
    next(err);
  }
});

function validatePantryItem(body: Record<string, string>): string | null {
  const { name, quantity, unit, expirationDate, notes } = body;

  if (!name || !name.trim()) return "Item name is required";
  if (name.length > 200) return "Item name must be 200 characters or less";

  if (quantity !== undefined && quantity !== "") {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) return "Quantity must be a non-negative number";
  }

  if (unit !== undefined && unit !== "" && !UNITS.includes(unit)) {
    return "Invalid unit";
  }

  if (expirationDate !== undefined && expirationDate !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || isNaN(Date.parse(expirationDate))) {
      return "Invalid date format (expected YYYY-MM-DD)";
    }
  }

  if (notes !== undefined && notes.length > 500) {
    return "Notes must be 500 characters or less";
  }

  return null;
}

router.post("/add", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const { name, quantity, unit, category, expirationDate, notes, barcode, isStaple } = req.body;

    const validationError = validatePantryItem(req.body);
    if (validationError) {
      setFlash(req, "error", validationError);
      return res.redirect("/pantry/add");
    }

    await pantryService.addItem(userId, {
      name,
      quantity,
      unit,
      category,
      expirationDate,
      notes,
      barcode,
      isStaple: isStaple ? 1 : 0,
    });

    setFlash(req, "success", "Item added to pantry");
    res.redirect("/pantry");
  } catch (err) {
    next(err);
  }
});

router.get("/:id/edit", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id);

    const item = await pantryService.getItem(id, userId);

    if (!item) {
      setFlash(req, "error", "Item not found");
      return res.redirect("/pantry");
    }

    res.render("pages/pantry/edit", {
      title: "Edit Item",
      item,
      categories: CATEGORIES,
      units: UNITS,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/edit", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id);
    const { name, quantity, unit, category, expirationDate, notes, isStaple } = req.body;

    const validationError = validatePantryItem(req.body);
    if (validationError) {
      setFlash(req, "error", validationError);
      return res.redirect(`/pantry/${id}/edit`);
    }

    await pantryService.updateItem(id, userId, {
      name,
      quantity,
      unit,
      category,
      expirationDate,
      notes,
      isStaple: isStaple ? 1 : 0,
    });

    setFlash(req, "success", "Item updated");
    res.redirect("/pantry");
  } catch (err) {
    next(err);
  }
});

router.post("/:id/delete", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id);

    await pantryService.deleteItem(id, userId);

    setFlash(req, "success", "Item removed from pantry");
    res.redirect("/pantry");
  } catch (err) {
    next(err);
  }
});

export default router;
