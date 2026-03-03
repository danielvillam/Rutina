const mongoose = require('mongoose');

/**
 * Collection: activities
 * Database   : rutina_db
 *
 * JSON structure stored in MongoDB:
 * {
 *   "_id"         : ObjectId,
 *   "userId"      : ObjectId  (ref: "User" — foreign key),
 *   "name"        : String    (max 80 chars),
 *   "date"        : String    ("YYYY-MM-DD"),
 *   "timeStart"   : String    ("HH:MM" o "" si no aplica),
 *   "timeEnd"     : String    ("HH:MM" o "" si no aplica),
 *   "category"    : String    (enum list below),
 *   "description" : String    (max 500 chars),
 *   "done"        : Boolean   (false por defecto),
 *   "createdAt"   : Date,
 *   "updatedAt"   : Date
 * }
 */
const CATEGORIES = ['general', 'salud', 'trabajo', 'estudio', 'personal', 'social'];

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    name: {
      type:      String,
      required:  [true, 'El nombre de la actividad es obligatorio.'],
      trim:      true,
      maxlength: [80, 'El nombre no puede superar 80 caracteres.'],
    },
    date: {
      type:     String,                             // "YYYY-MM-DD"
      required: [true, 'La fecha es obligatoria.'],
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD).'],
    },
    timeStart: {
      type:    String,
      default: '',
      match:   [/^([01]\d|2[0-3]):[0-5]\d$|^$/, 'Formato de hora inválido (HH:MM).'],
    },
    timeEnd: {
      type:    String,
      default: '',
      match:   [/^([01]\d|2[0-3]):[0-5]\d$|^$/, 'Formato de hora inválido (HH:MM).'],
    },
    category: {
      type:    String,
      enum:    { values: CATEGORIES, message: 'Categoría no válida.' },
      default: 'general',
    },
    description: {
      type:      String,
      default:   '',
      trim:      true,
      maxlength: [500, 'La descripción no puede superar 500 caracteres.'],
    },
    done: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Compound index: fast per-user date queries ──
activitySchema.index({ userId: 1, date: 1 });

// ── Clean output ─────────────────────────────────
activitySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Activity', activitySchema);
