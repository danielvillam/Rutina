require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const connectDB  = require('./config/db');

const authRoutes       = require('./routes/auth');
const activityRoutes   = require('./routes/activities');

// ── Connect to MongoDB ──────────────────
connectDB();

const app = express();

// ── Security headers ────────────────────
app.use(
  helmet({
    // Allow loading fonts from Google
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc:    ["'self'", 'fonts.gstatic.com'],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
      },
    },
  })
);

// ── CORS ────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL          // e.g. your deployed domain
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));

// ── Body parser ─────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── Rate limiter (general) ───────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { success: false, message: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', generalLimiter);

// ── Strict limiter for auth endpoints ───
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// ── API Routes ───────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/activities', activityRoutes);

// ── Health check ─────────────────────────
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'OK' }));

// ── Serve frontend static files ──────────
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, {
  // Don't serve .env or backend source files
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Catch-all → serve index.html (SPA)
app.get('*', (req, res) => {
  // Only redirect non-API, non-file requests
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  }
});

// ── Global error handler ─────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor.'
      : err.message,
  });
});

// ── Start server ─────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✦ Rutina Dashboard corriendo en http://localhost:${PORT}`);
  console.log(`  Entorno: ${process.env.NODE_ENV || 'development'}`);
});
