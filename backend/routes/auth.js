const express   = require('express');
const jwt       = require('jsonwebtoken');
const validator = require('validator');
const User      = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Helper: sign JWT ──────────────────────
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ── Sanitize: prevent NoSQL injection ────
const sanitize = (str) =>
  typeof str === 'string' ? str.replace(/[${}]/g, '') : '';

/* ──────────────────────────────────────────
   POST /api/auth/register
   Body: { username, password }
────────────────────────────────────────── */
router.post('/register', async (req, res) => {
  try {
    let { username, password } = req.body;

    username = sanitize(username || '').toLowerCase().trim();
    password = sanitize(password || '');

    // ── Validation ──
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son obligatorios.' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, message: 'El usuario debe tener entre 3 y 30 caracteres.' });
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Solo letras minúsculas, números y guiones bajos.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    if (password.length > 72) {
      return res.status(400).json({ success: false, message: 'La contraseña es demasiado larga.' });
    }

    // ── Check existing user ──
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }

    // ── Create user (password gets hashed in pre-save hook) ──
    const user = await User.create({ username, passwordHash: password });
    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente.',
      token,
      user: { id: user._id, username: user.username },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }
    console.error('[register]', err.message);
    res.status(500).json({ success: false, message: 'Error al crear la cuenta.' });
  }
});

/* ──────────────────────────────────────────
   POST /api/auth/login
   Body: { username, password }
────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    let { username, password } = req.body;

    username = sanitize(username || '').toLowerCase().trim();
    password = sanitize(password || '');

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son obligatorios.' });
    }

    // Explicitly select passwordHash (excluded by default)
    const user = await User.findOne({ username }).select('+passwordHash');
    if (!user) {
      // Same message for both cases to avoid user enumeration
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    const token = signToken(user._id);

    res.json({
      success: true,
      message: 'Sesión iniciada.',
      token,
      user: { id: user._id, username: user.username },
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ success: false, message: 'Error al iniciar sesión.' });
  }
});

/* ──────────────────────────────────────────
   GET /api/auth/me  — verify current token
────────────────────────────────────────── */
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
