# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Pantry Bot is a full-stack Node.js/Express app for pantry management, AI-powered recipe generation, nutrition tracking, grocery list creation, and barcode scanning. It uses EJS templates for the frontend, PostgreSQL via Drizzle ORM for persistence, and integrates with Spoonacular, USDA, OpenFoodFacts, and Anthropic Claude APIs.

The app is containerized and deployed to a self-hosted k3s cluster on `bulbasaur` (see `~/Dev/portfolio/CLAUDE.md` for cluster details). Platform-level k8s pieces (CloudNativePG Postgres, `github-deployer` RBAC, etc.) live in the sibling `bulbasaur-infra/` repo.

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

# Kubernetes (from this repo root)
kubectl kustomize k8s/overlays/prod          # Render manifests for inspection
kubectl apply --dry-run=server -k k8s/overlays/prod   # Validate against live API without changes
kubectl logs -n pantry-bot deployment/pantry-bot -f   # Tail running app logs
kubectl rollout restart deployment/pantry-bot -n pantry-bot   # Force a redeploy of current image
```

## Architecture

**App contract:** The container must (1) listen on the configured port (default 3000) and (2) expose `GET /health` returning HTTP 200. Both liveness and readiness probes hit `/health`.

**Kubernetes manifests (`k8s/`):**
- `k8s/base/` — `Deployment` (1 replica, port 3000, health probes, resource limits, non-root), `Service` (ClusterIP, :80 → :3000), `Ingress` (Traefik, host `pantrybot.cwnel.com`, TLS via `pantrybot-tls` Secret), `Certificate` (cert-manager, issued by `letsencrypt-prod` ClusterIssuer via DNS-01)
- `k8s/overlays/prod/` — kustomize overlay setting `namespace: pantry-bot` and patching the image tag; the deploy workflow runs `kustomize edit set image` to pin the tag to the commit SHA

**Cluster connection:** App namespace `pantry-bot`. Connects to shared Postgres at `platform-pg-rw.platform.svc.cluster.local:5432` (CloudNativePG-managed) using credentials in the `db-creds` Secret. App-level secrets (Spoonacular, USDA, Anthropic, session) live in the `app-secrets` Secret, populated by the deploy workflow from GitHub repo secrets.

## Key Files

- `src/index.ts` — Entry point: initializes DB, starts Express server
- `src/app.ts` — Express configuration, middleware stack, route registration
- `src/db/` — Database connection (`index.ts`) and Drizzle schema (`schema.ts`)
- `src/services/` — Business logic layer (see Services section)
- `src/routes/` — Express route handlers (see Routes section)
- `src/middleware/` — auth, csrf, flash, error middleware
- `src/views/` — EJS templates
- `Dockerfile` — Multi-stage build (Node 20-Alpine, non-root user)
- `.dockerignore` — Excludes `.env*`, keys, build artifacts from images
- `k8s/` — Kubernetes manifests (`base/` + `overlays/prod/`)
- `.github/workflows/deploy.yml` — CI/CD: test → build → push to GHCR → tailnet join → `kubectl apply` → rollout wait

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

Local dev reads these from `.env` (via `tsx --env-file=.env`). In production, they come from two Kubernetes Secrets:

- **`db-creds`** (platform-managed, provisioned once when the DB user was created) — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- **`app-secrets`** (recreated on every deploy by the workflow from GitHub repo secrets) — `SESSION_SECRET`, `SPOONACULAR_API_KEY`, `ANTHROPIC_API_KEY`, `USDA_API_KEY`

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
DB_SSL_REJECT_UNAUTHORIZED=false   # false in cluster (CNPG self-signed CA, traffic stays in-cluster)

# Sessions
SESSION_SECRET=<secret>            # MUST be set in production

# External APIs
SPOONACULAR_API_KEY=               # Required for recipe search
ANTHROPIC_API_KEY=                 # Required for AI recipe personalization
USDA_API_KEY=                      # Required for nutrition/barcode lookup
```

## Conventions

- **Health check:** `GET /health` must return HTTP 200 — used by Kubernetes liveness and readiness probes.
- **Security:** Helmet headers, CSRF tokens, rate limiting (auth: 10/15min, API: 100/15min), HTTPS-only cookies in production.
- **Image registry:** Public GHCR at `ghcr.io/cwnelson215/pantry-bot`. Pulls work without an `imagePullSecret`. Tags: `latest` (rolling) and `:<git sha>` (immutable per deploy).
- **Deploy trigger:** Push to `main`, or `workflow_dispatch`. Workflow runs tests first; failures halt before any image/cluster work.
- **TLS:** cert-manager issues `pantrybot.cwnel.com` via Let's Encrypt DNS-01 (Cloudflare). The `letsencrypt-prod` ClusterIssuer is installed and `Certificate/pantrybot-tls` is `Ready`; the app is live and publicly reachable at `https://pantrybot.cwnel.com` (valid TLS, `/health` → 200).

## Historical Note

This repo previously deployed to AWS via Pulumi (ECR/ECS/ALB). The Pulumi files (`index.ts`, `Pulumi.yaml`, `Pulumi.dev.yaml`) and AWS resources remain until the k3s deploy is verified; teardown is via `pulumi destroy` from this directory once cutover is complete.

Note: the k3s database was provisioned fresh (empty) — registered accounts and all app data still live only in the AWS RDS instance; they were not migrated. Run a `pg_dump` from RDS → `pg_restore` into `platform-pg` before teardown if that data must be kept.
