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

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const items = await pantryService.getItems(userId);

  res.render("pages/pantry/index", {
    title: "My Pantry",
    items,
  });
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

router.get("/:id", async (req, res) => {
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
});

router.post("/add", async (req, res) => {
  const userId = req.session.userId!;
  const { name, quantity, unit, category, expirationDate, notes, barcode, isStaple } = req.body;

  if (!name) {
    setFlash(req, "error", "Item name is required");
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
});

router.get("/:id/edit", async (req, res) => {
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
});

router.post("/:id/edit", async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  const { name, quantity, unit, category, expirationDate, notes, isStaple } = req.body;

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
});

router.post("/:id/delete", async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);

  await pantryService.deleteItem(id, userId);

  setFlash(req, "success", "Item removed from pantry");
  res.redirect("/pantry");
});

export default router;
