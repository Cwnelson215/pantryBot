import path from "path";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { config } from "./config";
import { pool } from "./db/client";
import { loadUser } from "./middleware/auth";
import { csrfMiddleware } from "./middleware/csrf";
import { flashMiddleware } from "./middleware/flash";
import { errorHandler } from "./middleware/error";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import dashboardRouter from "./routes/dashboard";
import pantryRouter from "./routes/pantry";
import recipesRouter from "./routes/recipes";
import nutritionRouter from "./routes/nutrition";
import groceryRouter from "./routes/grocery";
import preferencesRouter from "./routes/preferences";

const PgSession = connectPgSimple(session);

const app = express();

// Behind the k3s edge (nginx → Traefik), trust the proxy so Express derives
// the client protocol from X-Forwarded-Proto.
app.set("trust proxy", 1);

// The public edge proxy terminates TLS but does not forward X-Forwarded-Proto,
// so Express would see the in-cluster hop as plaintext and express-session would
// refuse to emit the Secure session cookie — breaking sessions and CSRF for
// every request. The app is only reachable via that HTTPS-only edge, so in
// production treat forwarded requests as secure. Runs before the session
// middleware so the cookie is issued correctly.
if (config.nodeEnv === "production") {
  app.use((req, _res, next) => {
    req.headers["x-forwarded-proto"] = "https";
    next();
  });
}

// View engine
app.set("view engine", "ejs");
app.set("views", config.viewsPath);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// Health check (before session/auth middleware to avoid DB dependency for ALB)
app.use("/health", healthRouter);

// Static files
app.use(express.static(path.join(__dirname, "..", "public")));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

// Sessions
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
    },
  })
);

// Global middleware
app.use(flashMiddleware);
app.use(loadUser);
app.use(csrfMiddleware);

// Rate limiting (disabled in test to avoid flaky test failures)
if (config.nodeEnv !== "test") {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many attempts, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/login", authLimiter);
  app.use("/register", authLimiter);
  app.use("/nutrition/api", apiLimiter);
  app.use("/recipes/search", apiLimiter);
  app.use("/pantry/lookup-barcode", apiLimiter);
}

// Routes
app.use("/", authRouter);
app.use("/", dashboardRouter);
app.use("/pantry", pantryRouter);
app.use("/recipes", recipesRouter);
app.use("/grocery", groceryRouter);
app.use("/nutrition", nutritionRouter);
app.use("/preferences", preferencesRouter);

// 404 catch-all
app.use((req, res) => {
  res.status(404).render("pages/error", {
    title: "Not Found",
    message: "The page you're looking for doesn't exist.",
  });
});

// Error handler
app.use(errorHandler);

export default app;
