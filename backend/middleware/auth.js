const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protects routes — verifies JWT from Authorization: Bearer <token>
 * Attaches req.user = { id, username } on success.
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Confirm user still exists (handles deleted-account edge case)
    const user = await User.findById(decoded.id).select('_id username');
    if (!user) {
      return res.status(401).json({ success: false, message: 'El usuario ya no existe.' });
    }

    req.user = { id: user._id.toString(), username: user.username };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Sesión expirada. Inicia sesión de nuevo.' });
    }
    return res.status(401).json({ success: false, message: 'Token inválido.' });
  }
};

module.exports = { protect };
