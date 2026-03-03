const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

/**
 * Collection: users
 * Database   : rutina_db
 *
 * JSON structure stored in MongoDB:
 * {
 *   "_id"          : ObjectId,
 *   "username"     : String   (unique, 3-30 chars, lowercase alphanumeric + _),
 *   "passwordHash" : String   (bcrypt hash — NEVER stored in plain text),
 *   "createdAt"    : Date,
 *   "updatedAt"    : Date
 * }
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type:      String,
      required:  [true, 'El nombre de usuario es obligatorio.'],
      unique:    true,
      trim:      true,
      lowercase: true,
      minlength: [3,  'El usuario debe tener al menos 3 caracteres.'],
      maxlength: [30, 'El usuario no puede superar 30 caracteres.'],
      match: [
        /^[a-z0-9_]+$/,
        'Solo se permiten letras minúsculas, números y guiones bajos.',
      ],
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false,   // never returned in queries by default
    },
  },
  { timestamps: true }
);

// ── Hash password before saving ──────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// ── Compare candidate password ───────────
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// ── Remove sensitive fields from JSON output ──
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
