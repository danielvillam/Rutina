const mongoose = require('mongoose');

/**
 * Collection: activities
 * Database   : rutina_db
 *
 * JSON structure stored in MongoDB:
 * {
 *   "_id"               : ObjectId,
 *   "userId"            : ObjectId  (ref: "User" — foreign key),
 *   "name"              : String    (max 80 chars),
 *   "date"              : String    ("YYYY-MM-DD"),
 *   "timeStart"         : String    ("HH:MM" o "" si no aplica),
 *   "timeEnd"           : String    ("HH:MM" o "" si no aplica),
 *   "category"          : String    (enum list below),
 *   "description"       : String    (max 500 chars),
 *   "done"              : Boolean   (false por defecto),
 *   "recurrenceGroupId" : ObjectId  (null = actividad simple; mismo valor para todas las ocurrencias de una serie),
 *   "recurrence"        : {
 *     "enabled"    : Boolean,
 *     "frequency"  : "daily" | "weekly" | "monthly",
 *     "daysOfWeek" : [0-6]   (0=Dom … 6=Sáb; solo relevante si frequency="weekly"),
 *     "endDate"    : String  ("YYYY-MM-DD")
 *   },
 *   "createdAt"         : Date,
 *   "updatedAt"         : Date
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

    // ── Recurrence ────────────────────────────────
    // All occurrences of the same series share the same recurrenceGroupId.
    // null  →  actividad individual (no es parte de ninguna serie).
    recurrenceGroupId: {
      type:    mongoose.Schema.Types.ObjectId,
      default: null,
      index:   true,
    },

    // The recurrence rule is stored on every occurrence so the series can
    // be reconstructed even if the first occurrence is deleted.
    recurrence: {
      enabled:    { type: Boolean,  default: false },
      frequency:  { type: String,   enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
      daysOfWeek: [{ type: Number,  min: 0, max: 6 }],
      endDate:    { type: String,   match: [/^\d{4}-\d{2}-\d{2}$|^$/, 'Formato de fecha inválido.'], default: '' },
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
