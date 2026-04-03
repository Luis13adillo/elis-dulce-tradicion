import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ordersRouter from './routes/orders.js';
import orderTransitionsRouter from './routes/orderTransitions.js';
import orderSearchRouter from './routes/orderSearch.js';
import paymentsRouter from './routes/payments.js';
import webhooksRouter from './routes/webhooks.js';
import uploadRouter from './routes/upload.js';
import productsRouter from './routes/products.js';
import configuratorRouter from './routes/configurator.js';
import pricingRouter from './routes/pricing.js';
import capacityRouter from './routes/capacity.js';
import inventoryRouter from './routes/inventory.js';
import deliveryRouter from './routes/delivery.js';
import customersRouter from './routes/customers.js';
import ordersReorderRouter from './routes/orders-reorder.js';
import analyticsRouter from './routes/analytics.js';
import reportsRouter from './routes/reports.js';
import cancellationRouter from './routes/cancellation.js';
import healthRouter from './routes/health.js';

// Security middleware
import { corsMiddleware, corsOptions } from './middleware/cors.js';
import { cookieParser, generateToken, doubleCsrfProtection } from './middleware/csrf.js';
import { validateInput } from './middleware/validateInput.js';
import { generalLimiter, orderCreationLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { validateEnvironment } from './utils/envValidation.js';
import { versioningMiddleware } from './middleware/versioning.js';

dotenv.config();

// Validate environment variables on startup
validateEnvironment();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Security Headers (helmet.js)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "https://maps.googleapis.com"],
      connectSrc: ["'self'", process.env.SUPABASE_URL, "https://maps.googleapis.com", "https://maps.gstatic.com"].filter(Boolean),
      frameSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false, // Allow Google Maps
}));

// CORS
app.use(corsMiddleware);

// Cookie parsing (required for CSRF double-submit cookie pattern)
app.use(cookieParser());

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(validateInput);

// CSRF protection — exempt Stripe webhooks (handled before versioning middleware)
// Webhooks use raw body + Stripe signature, not JSON, so must be registered before body parser
// The doubleCsrfProtection middleware only applies to POST/PUT/PATCH/DELETE
app.use((req, res, next) => {
  // Exclude webhook routes from CSRF
  if (req.path.startsWith('/api/v1/webhooks') || req.path.startsWith('/api/webhooks')) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
});

// API Versioning
app.use(versioningMiddleware);

// Rate limiting
app.use(generalLimiter);

// Serve uploaded files (with security)
app.use('/uploads', express.static(join(__dirname, 'uploads'), {
  dotfiles: 'ignore',
  index: false,
}));

// Swagger/OpenAPI Documentation
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.config.js';
import './swagger-responses.js'; // Import response definitions
import './routes/orders-docs.js'; // Import order documentation

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Eli's Bakery API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Health check endpoint
app.use('/api/health', healthRouter);

// CSRF token endpoint — returns a token for the SPA to use
app.get('/api/v1/csrf-token', (req, res) => {
  const token = generateToken(req, res);
  res.json({ token });
});

// API Versioning - All routes prefixed with /v1
// Note: cancellationRouter must come before ordersRouter to catch /:id/cancel routes
// Apply order creation rate limiter to order creation endpoints

// Versioned routes (preferred)
app.use('/api/v1/orders', orderCreationLimiter, ordersRouter);
app.use('/api/v1/orders', orderTransitionsRouter);
app.use('/api/v1/orders', orderSearchRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/configurator', configuratorRouter);
app.use('/api/v1/pricing', pricingRouter);
app.use('/api/v1/capacity', capacityRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/delivery', deliveryRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/orders', ordersReorderRouter);
app.use('/api/v1/orders', cancellationRouter);

// Legacy routes (for backward compatibility - deprecated)
app.use('/api/orders', orderCreationLimiter, ordersRouter);
app.use('/api/orders', orderTransitionsRouter);
app.use('/api/orders', orderSearchRouter);
// Legacy routes (for backward compatibility - deprecated)
app.use('/api/payments', paymentsRouter);
app.use('/api/webhooks', webhooksRouter); // Webhooks don't need rate limiting (they're from Stripe)
app.use('/api/upload', uploadRouter);
app.use('/api/products', productsRouter);
app.use('/api/configurator', configuratorRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/capacity', capacityRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/delivery', deliveryRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersReorderRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/orders', cancellationRouter);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start scheduled jobs for state transitions
if (process.env.NODE_ENV !== 'test') {
  const { startScheduledJobs } = await import('./jobs/orderStateScheduler.js');
  startScheduledJobs();
}

app.listen(PORT, () => {
  const allowedOrigins = corsOptions.origin ? ['configured'] : [];
  console.log(`\n🎂 Eli's Bakery Backend Running`);
  console.log(`   - Port: ${PORT}`);
  console.log(`   - Env:  ${process.env.NODE_ENV}`);
  console.log(`   - DB:   Supabase Connected`);
  console.log(`   - API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`   - Health: http://localhost:${PORT}/api/health\n`);
});

export default app;
