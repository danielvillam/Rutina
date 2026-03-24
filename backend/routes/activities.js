const express    = require('express');
const mongoose   = require('mongoose');
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

function parseReminderMinutes(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { ok: false, message: 'El recordatorio debe ser un número entero de minutos.' };
  }
  if (value < 0 || value > 120) {
    return { ok: false, message: 'El recordatorio debe estar entre 0 y 120 minutos.' };
  }
  return { ok: true, value };
}

/* ──────────────────────────────────────────────────────────────────
   generateDates()
   Returns an array of "YYYY-MM-DD" strings for each occurrence of
   a recurring activity from startDate (inclusive) to endDate
   (inclusive), capped at MAX_OCCURRENCES.

   frequency "daily"   → every day
   frequency "weekly"  → only on days listed in daysOfWeek (0=Sun…6=Sat)
   frequency "monthly" → same calendar day each month
────────────────────────────────────────────────────────────────── */
const MAX_OCCURRENCES = 365;

function generateDates(startDate, endDate, frequency, daysOfWeek) {
  const dates = [];
  const end   = new Date(endDate   + 'T00:00:00Z');
  const cur   = new Date(startDate + 'T00:00:00Z');

  while (cur <= end && dates.length < MAX_OCCURRENCES) {
    const dayOfWeek = cur.getUTCDay();   // 0 = Sun, 6 = Sat
    const dateStr   = cur.toISOString().slice(0, 10);

    if (frequency === 'daily') {
      dates.push(dateStr);
      cur.setUTCDate(cur.getUTCDate() + 1);

    } else if (frequency === 'weekly') {
      if (daysOfWeek.includes(dayOfWeek)) {
        dates.push(dateStr);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);

    } else if (frequency === 'monthly') {
      dates.push(dateStr);
      // Advance one month; JS handles month overflow automatically
      // (e.g. Mar 31 + 1 month → Apr 30)
      const d = cur.getUTCDate();
      cur.setUTCMonth(cur.getUTCMonth() + 1);
      // If the day shifted (e.g. Feb 28 from Mar 31), cap at month end
      if (cur.getUTCDate() !== d) cur.setUTCDate(0);
    }
  }

  return dates;
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
   Body: { name, date, timeStart, timeEnd, category, description,
           recurrence?: { enabled, frequency, daysOfWeek, endDate } }

   Response (no recurrence) : { success, data: Activity }
   Response (with recurrence): { success, data: Activity[], count: N }
────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const { name, date, timeStart, timeEnd, category, description, reminderMinutesBefore } = req.body;

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
    if (cleanTS && cleanTE && cleanTE < cleanTS) {
      return res.status(400).json({ success: false, message: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    const reminderParsed = parseReminderMinutes(reminderMinutesBefore);
    if (!reminderParsed.ok) {
      return res.status(400).json({ success: false, message: reminderParsed.message });
    }
    if (reminderParsed.value !== null && !cleanTS) {
      return res.status(400).json({ success: false, message: 'Para usar recordatorio debes indicar hora de inicio.' });
    }

    const catFinal = VALID_CATS.includes(cleanCat) ? cleanCat : 'general';

    // ── Base activity data ──
    const baseData = {
      userId:      req.user.id,
      name:        cleanName,
      date:        cleanDate,
      timeStart:   cleanTS,
      timeEnd:     cleanTE,
      category:    catFinal,
      description: cleanDesc,
      reminderMinutesBefore: reminderParsed.value,
    };

    // ── Recurrence path ──────────────────────────────────────────────
    const recurRaw = req.body.recurrence;
    if (recurRaw && recurRaw.enabled === true) {
      const freq    = sanitizeStr(recurRaw.frequency || 'weekly');
      const endDate = sanitizeStr(recurRaw.endDate   || '');
      const dow     = Array.isArray(recurRaw.daysOfWeek)
        ? recurRaw.daysOfWeek.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
        : [];

      if (!['daily', 'weekly', 'monthly'].includes(freq)) {
        return res.status(400).json({ success: false, message: 'Frecuencia de repetición no válida.' });
      }
      if (!endDate || !DATE_RE.test(endDate)) {
        return res.status(400).json({ success: false, message: 'La fecha de fin de repetición es obligatoria.' });
      }
      if (endDate <= cleanDate) {
        return res.status(400).json({ success: false, message: 'La fecha de fin de repetición debe ser posterior a la fecha de inicio.' });
      }
      if (freq === 'weekly' && dow.length === 0) {
        return res.status(400).json({ success: false, message: 'Selecciona al menos un día de la semana para la repetición semanal.' });
      }

      const recurrenceRule = { enabled: true, frequency: freq, daysOfWeek: dow, endDate };
      const groupId        = new mongoose.Types.ObjectId();
      const occurrenceDates = generateDates(cleanDate, endDate, freq, dow);

      const docs = occurrenceDates.map(d => ({
        ...baseData,
        date:              d,
        recurrenceGroupId: groupId,
        recurrence:        recurrenceRule,
      }));

      const saved = await Activity.insertMany(docs);
      return res.status(201).json({ success: true, data: saved, count: saved.length });
    }

    // ── Single activity path ─────────────────────────────────────────
    const activity = await Activity.create(baseData);
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

    const allowed = ['done', 'name', 'date', 'timeStart', 'timeEnd', 'category', 'description', 'reminderMinutesBefore'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] === undefined) continue;

      if (key === 'done') {
        updates.done = Boolean(req.body.done);
        continue;
      }

      if (key === 'reminderMinutesBefore') {
        const reminderParsed = parseReminderMinutes(req.body.reminderMinutesBefore);
        if (!reminderParsed.ok) {
          return res.status(400).json({ success: false, message: reminderParsed.message });
        }
        updates.reminderMinutesBefore = reminderParsed.value;
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
    const newReminder = updates.reminderMinutesBefore ?? activity.reminderMinutesBefore;
    if (newStart && newEnd && newEnd < newStart) {
      return res.status(400).json({ success: false, message: 'La hora de fin debe ser posterior a la de inicio.' });
    }
    if (newReminder !== null && !newStart) {
      return res.status(400).json({ success: false, message: 'Para usar recordatorio debes indicar hora de inicio.' });
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
   Query: ?scope=future   →  delete this occurrence AND all future
                             occurrences in the same recurrence group
          (omitted)        →  delete only this single occurrence
   Users can only delete their own activities.
────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const act = await Activity.findOne({ _id: req.params.id, userId: req.user.id });
    if (!act) return res.status(404).json({ success: false, message: 'Actividad no encontrada.' });

    // ── Delete this + all future occurrences in the same series ──
    if (req.query.scope === 'future' && act.recurrenceGroupId) {
      const result = await Activity.deleteMany({
        userId:            req.user.id,
        recurrenceGroupId: act.recurrenceGroupId,
        date:              { $gte: act.date },
      });
      return res.json({
        success:      true,
        message:      `${result.deletedCount} actividade(s) eliminada(s).`,
        deletedCount: result.deletedCount,
        scope:        'future',
      });
    }

    // ── Delete only this single occurrence ────────────────────────
    await act.deleteOne();
    res.json({ success: true, message: 'Actividad eliminada.', scope: 'one' });

  } catch (err) {
    console.error('[DELETE /activities/:id]', err.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la actividad.' });
  }
});

module.exports = router;
