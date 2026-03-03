const express    = require('express');
const Activity   = require('../models/Activity');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

const VALID_CATS = ['general', 'salud', 'trabajo', 'estudio', 'personal', 'social'];
const TIME_RE    = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeStr(v) {
  return typeof v === 'string' ? v.replace(/[${}]/g, '').trim() : '';
}

/* ──────────────────────────────────────────
   GET /api/activities
   Query: ?date=YYYY-MM-DD  (optional filter)
────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.user.id };

    if (req.query.date && DATE_RE.test(req.query.date)) {
      filter.date = req.query.date;
    }

    const activities = await Activity.find(filter).sort({ date: 1, timeStart: 1, createdAt: 1 });
    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('[GET /activities]', err.message);
    res.status(500).json({ success: false, message: 'Error al obtener actividades.' });
  }
});

/* ──────────────────────────────────────────
   POST /api/activities
   Body: { name, date, timeStart, timeEnd, category, description }
────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const { name, date, timeStart, timeEnd, category, description } = req.body;

    const cleanName = sanitizeStr(name);
    const cleanDate = sanitizeStr(date);
    const cleanTS   = sanitizeStr(timeStart);
    const cleanTE   = sanitizeStr(timeEnd);
    const cleanCat  = sanitizeStr(category);
    const cleanDesc = sanitizeStr(description);

    // ── Validate required fields ──
    if (!cleanName)               return res.status(400).json({ success: false, message: 'El nombre es obligatorio.' });
    if (!cleanDate)               return res.status(400).json({ success: false, message: 'La fecha es obligatoria.' });
    if (!DATE_RE.test(cleanDate)) return res.status(400).json({ success: false, message: 'Formato de fecha inválido.' });
    if (cleanName.length > 80)    return res.status(400).json({ success: false, message: 'Nombre demasiado largo (máx 80 chars).' });
    if (cleanDesc.length > 500)   return res.status(400).json({ success: false, message: 'Descripción demasiado larga (máx 500 chars).' });

    if (cleanTS && !TIME_RE.test(cleanTS)) return res.status(400).json({ success: false, message: 'Formato de hora inicio inválido.' });
    if (cleanTE && !TIME_RE.test(cleanTE)) return res.status(400).json({ success: false, message: 'Formato de hora fin inválido.' });

    // Ensure end >= start when both set
    if (cleanTS && cleanTE && cleanTE < cleanTS) {
      return res.status(400).json({ success: false, message: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    const catFinal = VALID_CATS.includes(cleanCat) ? cleanCat : 'general';

    const activity = await Activity.create({
      userId:      req.user.id,
      name:        cleanName,
      date:        cleanDate,
      timeStart:   cleanTS,
      timeEnd:     cleanTE,
      category:    catFinal,
      description: cleanDesc,
    });

    res.status(201).json({ success: true, data: activity });
  } catch (err) {
    console.error('[POST /activities]', err.message);
    res.status(500).json({ success: false, message: 'Error al crear la actividad.' });
  }
});

/* ──────────────────────────────────────────
   PATCH /api/activities/:id
   Body: { done?, name?, date?, timeStart?, timeEnd?, category?, description? }
   Users can only update their own activities.
────────────────────────────────────────── */
router.patch('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({ _id: req.params.id, userId: req.user.id });
    if (!activity) return res.status(404).json({ success: false, message: 'Actividad no encontrada.' });

    const allowed = ['done', 'name', 'date', 'timeStart', 'timeEnd', 'category', 'description'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] === undefined) continue;

      if (key === 'done') {
        updates.done = Boolean(req.body.done);
        continue;
      }

      const val = sanitizeStr(String(req.body[key]));

      if (key === 'date' && !DATE_RE.test(val))        return res.status(400).json({ success: false, message: 'Fecha inválida.' });
      if ((key === 'timeStart' || key === 'timeEnd') && val && !TIME_RE.test(val))
        return res.status(400).json({ success: false, message: 'Hora inválida.' });
      if (key === 'category' && !VALID_CATS.includes(val))
        return res.status(400).json({ success: false, message: 'Categoría inválida.' });

      updates[key] = val;
    }

    // Re-validate time range after potential individual updates
    const newStart = updates.timeStart ?? activity.timeStart;
    const newEnd   = updates.timeEnd   ?? activity.timeEnd;
    if (newStart && newEnd && newEnd < newStart) {
      return res.status(400).json({ success: false, message: 'La hora de fin debe ser posterior a la de inicio.' });
    }

    Object.assign(activity, updates);
    await activity.save();

    res.json({ success: true, data: activity });
  } catch (err) {
    console.error('[PATCH /activities/:id]', err.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la actividad.' });
  }
});

/* ──────────────────────────────────────────
   DELETE /api/activities/:id
   Users can only delete their own activities.
────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const result = await Activity.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!result) return res.status(404).json({ success: false, message: 'Actividad no encontrada.' });
    res.json({ success: true, message: 'Actividad eliminada.' });
  } catch (err) {
    console.error('[DELETE /activities/:id]', err.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la actividad.' });
  }
});

module.exports = router;
