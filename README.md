# Pantry Bot

A full-stack web application for managing your kitchen pantry, discovering recipes based on what you have on hand, tracking nutrition, and generating grocery lists.

## Features

- **Pantry Management** — Track food items with quantities, units, categories, and expiration dates. Identify staple items for auto-replenishment.
- **Barcode Scanning** — Look up products by barcode using OpenFoodFacts and USDA databases to quickly add items to your pantry.
- **Recipe Discovery** — Search for recipes based on your pantry ingredients via the Spoonacular API.
- **AI Recipe Personalization** — Claude AI tailors recipes to your dietary preferences, allergies, and available ingredients.
- **Cooking Integration** — Cook a recipe and automatically deduct ingredients from your pantry. Get shopping lists for missing ingredients.
- **Grocery Lists** — Generate shopping lists from recipes, with items classified as missing, partial, or already available.
- **Nutrition Tracking** — Log meals with full macro and micronutrient data. View weekly nutrition summaries against personal targets.
- **User Preferences** — Set dietary tags, allergies, cuisine preferences, serving sizes, and nutrient targets.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express
- **Views:** EJS templates
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** bcrypt + express-session (PostgreSQL session store)
- **External APIs:** Spoonacular, USDA Food Data Central, OpenFoodFacts, Anthropic Claude
- **Testing:** Vitest + Supertest
- **Infrastructure:** Docker, AWS ECS Fargate, Pulumi (IaC)

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- API keys for Spoonacular, USDA, and Anthropic Claude

### Installation

```bash
git clone https://github.com/cwnelson/pantry-bot.git
cd pantry-bot
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=pantry_bot
DB_USER=postgres
DB_PASSWORD=your_password

SESSION_SECRET=your_session_secret

SPOONACULAR_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
USDA_API_KEY=your_key
```

### Database Setup

Create the PostgreSQL database, then run the Drizzle ORM migrations:

```bash
createdb pantry_bot
npx drizzle-kit push
```

### Run Locally

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript for production |
| `npm start` | Run production build |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Architecture

```
src/
  index.ts          # Entry point — DB init, server start
  app.ts            # Express config, middleware, routes
  db/
    index.ts        # Database connection
    schema.ts       # Drizzle ORM table definitions
  routes/           # Express route handlers
    auth.ts         # Login, register, logout
    dashboard.ts    # Main dashboard
    pantry.ts       # Pantry CRUD + barcode lookup
    recipes.ts      # Recipe search, details, cooking
    grocery.ts      # Grocery list management
    nutrition.ts    # Nutrition logging and summaries
    preferences.ts  # User preferences
    health.ts       # Health check endpoint
  services/         # Business logic layer
    auth.service.ts
    pantry.service.ts
    cooking.service.ts
    grocery.service.ts
    nutrition.service.ts
    claude.service.ts
    spoonacular.service.ts
    usda.service.ts
    openfoodfacts.service.ts
    barcode-lookup.service.ts
    unit-conversion.service.ts
    preferences.service.ts
  middleware/        # Express middleware
    auth.ts         # Authentication guards
    csrf.ts         # CSRF protection
    flash.ts        # Flash messages
    error.ts        # Global error handler
  views/            # EJS templates
```

## Deployment

The app is containerized with Docker (multi-stage build, Node 20-Alpine, non-root user) and deployed to AWS ECS Fargate via Pulumi.

Infrastructure is defined in `index.ts` and includes:
- ECR repository with lifecycle policy
- ECS Fargate service (Spot capacity)
- ALB target group with host-based routing (`pantrybot.cwnel.com`)

Shared AWS resources (VPC, ALB, ECS cluster, RDS, Route53) are managed by the [portfolio-platform](https://github.com/cwnelson/portfolio-platform) stack and referenced via `pulumi.StackReference`.

CI/CD is handled by GitHub Actions (`.github/workflows/deploy.yml`).

## License

MIT
