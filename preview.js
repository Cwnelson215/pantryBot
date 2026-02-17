// Temporary preview server — renders all pages with mock data, no DB required.
// Usage: node preview.js   → http://localhost:3333
const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views/pages'));
app.use(express.static(path.join(__dirname, 'public')));

const shared = { csrfToken: 'preview', flash: [] };

// --- Mock data ---
const user = { displayName: 'Alex' };
const pantryItems = [
  { id: 1, name: 'Chicken Breast', quantity: 2, unit: 'lbs', category: 'Protein', expirationDate: new Date(Date.now() + 2*86400000).toISOString(), notes: 'Organic' },
  { id: 2, name: 'Brown Rice', quantity: 3, unit: 'cups', category: 'Grains', expirationDate: new Date(Date.now() + 60*86400000).toISOString(), notes: '' },
  { id: 3, name: 'Broccoli', quantity: 1, unit: 'bunch', category: 'Vegetables', expirationDate: new Date(Date.now() + 4*86400000).toISOString(), notes: '' },
  { id: 4, name: 'Olive Oil', quantity: 1, unit: 'bottle', category: 'Oils', expirationDate: null, notes: 'Extra virgin' },
  { id: 5, name: 'Eggs', quantity: 12, unit: 'count', category: 'Protein', expirationDate: new Date(Date.now() + 1*86400000).toISOString(), notes: '' },
  { id: 6, name: 'Milk', quantity: 1, unit: 'gallon', category: 'Dairy', expirationDate: new Date(Date.now() - 1*86400000).toISOString(), notes: 'Whole milk' },
];
const expiringItems = pantryItems.filter(i => i.expirationDate).sort((a,b) => new Date(a.expirationDate) - new Date(b.expirationDate)).slice(0, 5);
const recentRecipes = [
  { title: 'Grilled Chicken Salad', source: 'spoonacular' },
  { title: 'Veggie Stir Fry', source: 'ai-generated' },
  { title: 'Pasta Primavera', source: 'spoonacular' },
];
const recipes = [
  { id: 101, title: 'Lemon Herb Chicken', image: 'https://placehold.co/400x300/e2e8f0/64748b?text=Recipe+Photo', usedIngredientCount: 3, missedIngredientCount: 1 },
  { id: 102, title: 'Vegetable Fried Rice', image: 'https://placehold.co/400x300/e2e8f0/64748b?text=Recipe+Photo', usedIngredientCount: 4, missedIngredientCount: 2 },
  { id: 103, title: 'Broccoli Cheddar Soup', image: 'https://placehold.co/400x300/e2e8f0/64748b?text=Recipe+Photo', usedIngredientCount: 2, missedIngredientCount: 3 },
];
const recipe = {
  id: 101, title: 'Lemon Herb Chicken', servings: 4, readyInMinutes: 35,
  image: 'https://placehold.co/600x300/e2e8f0/64748b?text=Lemon+Herb+Chicken',
  source: 'spoonacular',
  extendedIngredients: [
    { original: '2 lbs chicken breast' }, { original: '2 lemons, juiced' },
    { original: '3 cloves garlic, minced' }, { original: '2 tbsp olive oil' },
    { original: '1 tsp dried oregano' }, { original: 'Salt and pepper to taste' },
  ],
  analyzedInstructions: [{ steps: [
    { step: 'Preheat oven to 400°F.' },
    { step: 'Mix lemon juice, olive oil, garlic, and oregano in a bowl.' },
    { step: 'Place chicken in a baking dish and pour marinade over it.' },
    { step: 'Bake for 25-30 minutes until internal temperature reaches 165°F.' },
  ]}],
};
const nutrition = { calories: 320, protein: '38g', carbs: '4g', fat: '16g', fiber: '1g', sugar: '1g', sodium: '450mg' };
const personalization = 'Based on your preferences, I reduced the sodium and substituted butter with olive oil.\nThis version is also gluten-free.';
const savedRecipes = [
  { ...recipe, imageUrl: recipe.image, createdAt: new Date(), ingredientsJson: JSON.stringify(recipe.extendedIngredients), instructionsJson: JSON.stringify(recipe.analyzedInstructions), personalization },
  { id: 102, title: 'Veggie Stir Fry', source: 'ai-generated', servings: 2, imageUrl: 'https://placehold.co/400x300/e2e8f0/64748b?text=Stir+Fry', createdAt: new Date(Date.now() - 3*86400000), ingredientsJson: '["1 cup broccoli","2 tbsp soy sauce","1 cup rice"]', instructionsJson: '["Cook rice","Stir fry vegetables","Combine and serve"]' },
];
const today = new Date().toISOString().split('T')[0];
const totals = { calories: 1450, proteinG: 82, fatG: 48, carbsG: 180, fiberG: 12, sugarG: 35, sodiumMg: 1800, ironMg: 9, calciumMg: 500, vitaminDMcg: 5, potassiumMg: 1200, vitaminCMg: 45 };
const userPreferences = { calorieTarget: 2000, proteinTarget: 120, fatTarget: 65, carbsTarget: 250, fiberTarget: 25, sugarTarget: 50, sodiumTarget: 2300, dietaryTags: ['Vegetarian'], allergies: ['Peanuts'], cuisinePrefs: ['Italian','Mexican'], servingSize: 2 };
const entries = [
  { id: 1, foodName: 'Scrambled Eggs', servings: 1, calories: 220, proteinG: 14, carbsG: 2, fatG: 16 },
  { id: 2, foodName: 'Grilled Chicken Salad', servings: 1, calories: 450, proteinG: 38, carbsG: 12, fatG: 18 },
  { id: 3, foodName: 'Brown Rice Bowl', servings: 1, calories: 380, proteinG: 8, carbsG: 72, fatG: 6 },
];
const weeklySummary = Array.from({length: 7}, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (6 - i));
  const factor = 0.5 + Math.random() * 0.7;
  return { date: d.toISOString().split('T')[0], totals: Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, Math.round(v * factor)])) };
});

// --- Routes ---
app.get('/', (req, res) => res.render('dashboard', { ...shared, user, pantryCount: pantryItems.length, savedRecipeCount: savedRecipes.length, expiringItems, recentRecipes, title: 'Dashboard' }));
app.get('/login', (req, res) => res.render('login', { ...shared, title: 'Login' }));
app.get('/register', (req, res) => res.render('register', { ...shared, title: 'Register' }));
app.get('/pantry', (req, res) => res.render('pantry/index', { ...shared, user, items: pantryItems, title: 'Pantry' }));
app.get('/pantry/empty', (req, res) => res.render('pantry/index', { ...shared, user, items: [], title: 'Pantry' }));
app.get('/pantry/add', (req, res) => res.render('pantry/add', { ...shared, user, units: ['lbs','oz','cups','count','bunch','bottle','gallon','tbsp','tsp'], categories: ['Protein','Grains','Vegetables','Fruits','Dairy','Oils','Spices'], title: 'Add Item' }));
app.get('/pantry/:id/edit', (req, res) => res.render('pantry/edit', { ...shared, user, item: pantryItems[0], units: ['lbs','oz','cups','count','bunch','bottle','gallon'], categories: ['Protein','Grains','Vegetables','Fruits','Dairy','Oils','Spices'], title: 'Edit Item' }));
app.get('/recipes', (req, res) => res.render('recipes/index', { ...shared, user, title: 'Recipes' }));
app.get('/recipes/search', (req, res) => res.render('recipes/search', { ...shared, user, pantryItems, recipes, title: 'Search' }));
app.get('/recipes/generate', (req, res) => res.render('recipes/generate', { ...shared, user, pantryItems, title: 'Generate' }));
app.get('/recipes/saved', (req, res) => res.render('recipes/saved', { ...shared, user, recipes: savedRecipes, title: 'Saved' }));
app.get('/recipes/:id', (req, res) => res.render('recipes/detail', { ...shared, user, recipe, nutrition, personalization, title: recipe.title }));
app.get('/nutrition', (req, res) => res.render('nutrition/index', { ...shared, user, userPreferences, weeklySummary, title: 'Nutrition' }));
app.get('/nutrition/daily', (req, res) => res.render('nutrition/daily', { ...shared, user, date: req.query.date || today, totals, entries, userPreferences, title: 'Daily' }));
app.get('/preferences', (req, res) => res.render('preferences', { ...shared, user, preferences: userPreferences, dietaryOptions: ['Vegetarian','Vegan','Gluten-Free','Keto','Paleo','Dairy-Free'], allergyOptions: ['Peanuts','Tree Nuts','Shellfish','Dairy','Eggs','Soy','Wheat','Fish'], cuisineOptions: ['Italian','Mexican','Chinese','Japanese','Indian','Thai','Mediterranean','American','French','Korean'], title: 'Preferences' }));
app.get('/error', (req, res) => res.render('error', { ...shared, statusCode: 404, message: 'Page not found', title: 'Error' }));

// Flash message demo
app.get('/flash', (req, res) => res.render('dashboard', { ...shared, user, pantryCount: 6, savedRecipeCount: 3, expiringItems, recentRecipes, title: 'Dashboard',
  flash: [
    { type: 'success', message: 'Item added successfully!' },
    { type: 'error', message: 'Something went wrong.' },
    { type: 'info', message: 'Tip: You can scan barcodes to add items quickly.' },
    { type: 'warning', message: 'Milk expires tomorrow!' },
  ]
}));

app.listen(3333, () => {
  console.log('\n  Preview server running at http://localhost:3333\n');
  console.log('  Pages:');
  console.log('    http://localhost:3333/             Dashboard');
  console.log('    http://localhost:3333/login         Login');
  console.log('    http://localhost:3333/register      Register');
  console.log('    http://localhost:3333/pantry         Pantry (with items)');
  console.log('    http://localhost:3333/pantry/empty   Pantry (empty state)');
  console.log('    http://localhost:3333/pantry/add     Add Item');
  console.log('    http://localhost:3333/pantry/1/edit  Edit Item');
  console.log('    http://localhost:3333/recipes        Recipe Hub');
  console.log('    http://localhost:3333/recipes/search Recipe Search');
  console.log('    http://localhost:3333/recipes/generate  Generate Recipe');
  console.log('    http://localhost:3333/recipes/saved  Saved Recipes');
  console.log('    http://localhost:3333/recipes/101    Recipe Detail');
  console.log('    http://localhost:3333/nutrition      Nutrition Goals + Weekly');
  console.log('    http://localhost:3333/nutrition/daily Daily Nutrition');
  console.log('    http://localhost:3333/preferences    Preferences');
  console.log('    http://localhost:3333/error          Error Page');
  console.log('    http://localhost:3333/flash          Flash Messages Demo');
  console.log('');
});
