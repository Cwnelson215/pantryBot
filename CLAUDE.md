# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A containerized web application deployed on the portfolio platform. Infrastructure is defined with Pulumi (TypeScript) and references shared AWS resources (VPC, ALB, ECS cluster, RDS) from the platform stack via `pulumi.StackReference`.

Pantry Bot is a full-stack Node.js/Express app for pantry management, AI-powered recipe generation, nutrition tracking, grocery list creation, and barcode scanning. It uses EJS templates for the frontend, PostgreSQL via Drizzle ORM for persistence, and integrates with Spoonacular, USDA, OpenFoodFacts, and Anthropic Claude APIs.

## Commands

```bash
# Application
npm install           # Install dependencies
npm run dev           # Run locally (http://localhost:3000) — uses --env-file=.env
npm run build         # Build for production
npm start             # Start production server

# Testing (Vitest + Supertest)
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage

# Infrastructure (Pulumi)
npm run preview       # Preview infra changes
npm run up            # Deploy infra
npm run destroy       # Tear down infra
```

## Architecture

**App contract:** The container must (1) listen on the configured port (default 3000) and (2) expose `GET /health` returning HTTP 200.

**Infrastructure (`index.ts`):** Defines app-specific AWS resources:
- ECR repository (`portfolio/pantry-bot`) with lifecycle policy (keep last 10 images)
- Security group allowing traffic from the shared ALB
- ALB target group + host-based listener rule (`pantrybot.cwnel.com`)
- ECS Fargate task definition + service (Fargate Spot by default)

All shared resources (VPC, ALB, ECS cluster, Route53, ACM, CloudWatch log group, RDS) come from the platform stack and are imported via `pulumi.StackReference`.

## Key Files

- `src/index.ts` — Entry point: initializes DB, starts Express server
- `src/app.ts` — Express configuration, middleware stack, route registration
- `src/db/` — Database connection (`index.ts`) and Drizzle schema (`schema.ts`)
- `src/services/` — Business logic layer (see Services section)
- `src/routes/` — Express route handlers (see Routes section)
- `src/middleware/` — auth, csrf, flash, error middleware
- `src/views/` — EJS templates
- `index.ts` — Pulumi infrastructure definition
- `Pulumi.yaml` / `Pulumi.dev.yaml` — Pulumi project metadata and environment config
- `Dockerfile` — Multi-stage build (Node 20-Alpine, non-root user)
- `.github/workflows/deploy.yml` — CI/CD pipeline

## Services

| Service | Purpose |
|---------|---------|
| `auth` | User registration, login, password hashing (bcrypt) |
| `claude` | Anthropic Claude API — recipe personalization based on user preferences & pantry |
| `cooking` | Deduct pantry items when cooking, generate shopping lists for missing ingredients, auto-replenish staples |
| `pantry` | Add/update/delete pantry items, track quantities & expiration, identify staples |
| `grocery` | Grocery list management — classify missing/partial/matched ingredients |
| `nutrition` | Log meals with nutritional data, weekly nutrition summaries |
| `spoonacular` | Spoonacular API — recipe search by ingredients, recipe details |
| `usda` | USDA Food Data Central API — food search, nutrition details, barcode lookup |
| `openfoodfacts` | OpenFoodFacts API — barcode lookup, product info |
| `barcode-lookup` | Unified barcode lookup — queries OpenFoodFacts then USDA |
| `unit-conversion` | Convert between cooking units (volume, weight, count) |
| `preferences` | User dietary preferences, allergies, nutrition targets |

## Database

**ORM:** Drizzle ORM with PostgreSQL.

**Tables:**
- `users` — accounts with bcrypt-hashed passwords
- `user_preferences` — dietary tags, allergies, cuisine prefs, macro/micro nutrient targets (1:1 with users)
- `pantry_items` — food inventory with quantity, unit, category, expiration, barcode, staple flag
- `saved_recipes` — recipes from Spoonacular with personalization, nutrition, instructions
- `nutrition_logs` — daily meal logs with full macro/micro nutrient breakdown
- `grocery_lists` — shopping list containers
- `grocery_list_items` — individual items in a grocery list with checked state

**Schema defined in:** `src/db/schema.ts`

## Environment Variables

```
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pantry_bot
DB_USER=postgres
DB_PASSWORD=<secret>
DB_SSL_REJECT_UNAUTHORIZED=false   # "true" in production

# Sessions
SESSION_SECRET=<secret>            # MUST be set in production

# External APIs
SPOONACULAR_API_KEY=               # Required for recipe search
ANTHROPIC_API_KEY=                 # Required for AI recipe personalization
USDA_API_KEY=                      # Required for nutrition/barcode lookup
```

## Conventions

- **Naming:** Resources prefixed with `appName`. All tagged with Project, App, ManagedBy.
- **Config:** Environment-specific values in `Pulumi.{stack}.yaml`. Secrets via `pulumi config set --secret`.
- **Logs:** CloudWatch at `/ecs/portfolio-dev/pantry-bot`, 14-day retention.
- **Platform stack reference:** `cwnelson/portfolio-platform/dev`
- **Health check:** `GET /health` must return HTTP 200 — this is used by both the ALB target group and the ECS container health check.
- **Security:** Helmet headers, CSRF tokens, rate limiting (auth: 10/15min, API: 100/15min), HTTPS-only cookies in production.
