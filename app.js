//  Config 
const API = '/api';   // Relative  served by Express on same origin

//  Auth token 
let token    = localStorage.getItem('rutina_token') || null;
let authUser = null;   // { id, username }

//  In-memory activities cache 
let activities = [];

//  Reminder runtime state
let reminderTicker = null;
const REMINDER_TICK_MS = 30 * 1000;
const REMINDER_STORAGE_KEY = 'rutina_reminder_fired';

//  Calendar state 
let calYear         = new Date().getFullYear();
let calMonth        = new Date().getMonth();   // 0-indexed
let calSelectedDate = null;
let calFilteredActs = [];                      // last filtered set (for panel refresh)

//  Helper: authenticated fetch 
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(API + path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Error ${res.status}`);
  return body;
}

// 
// AUTH UI
// 
const authScreen  = document.getElementById('auth-screen');
const appWrapper  = document.getElementById('app-wrapper');

function showAuthScreen() {
  authScreen.style.display = 'grid';
  appWrapper.style.display = 'none';
}

function showApp(user) {
  authUser = user;
  authScreen.style.display = 'none';
  appWrapper.style.display = 'flex';
  document.getElementById('sidebar-username').textContent = user.username;
  document.getElementById('sidebar-avatar').textContent = user.username[0].toUpperCase();
  updateBadge();
  setDefaultDates();
  renderDashboard();
}

//  Tab switching 
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    clearAuthErrors();
  });
});

function clearAuthErrors() {
  ['login-error', 'register-error'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
  });
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('visible');
}

//  Password visibility toggle 
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '\uD83D\uDC41' : '\uD83D\uDE48';
  });
});

//  LOGIN 
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthErrors();
  const username = document.getElementById('l-username').value.trim();
  const password = document.getElementById('l-password').value;

  if (!username || !password) {
    return showAuthError('login-error', 'Completa todos los campos.');
  }

  const btn = document.getElementById('login-btn');
  btn.classList.add('btn-loading');
  btn.textContent = 'Iniciando...';

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    token = data.token;
    localStorage.setItem('rutina_token', token);
    await loadActivities();
    showApp(data.user);
  } catch (err) {
    showAuthError('login-error', err.message);
  } finally {
    btn.classList.remove('btn-loading');
    btn.textContent = 'Iniciar Sesión';
  }
});

//  REGISTER 
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthErrors();
  const username  = document.getElementById('r-username').value.trim().toLowerCase();
  const password  = document.getElementById('r-password').value;
  const password2 = document.getElementById('r-password2').value;

  if (!username || !password || !password2) {
    return showAuthError('register-error', 'Completa todos los campos.');
  }
  if (password !== password2) {
    return showAuthError('register-error', 'Las contraseñas no coinciden.');
  }
  if (password.length < 8) {
    return showAuthError('register-error', 'La contraseña debe tener al menos 8 caracteres.');
  }

  const btn = document.getElementById('register-btn');
  btn.classList.add('btn-loading');
  btn.textContent = 'Creando cuenta...';

  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    token = data.token;
    localStorage.setItem('rutina_token', token);
    await loadActivities();
    showApp(data.user);
    showToast('Cuenta creada. ¡Bienvenido a Rutina!');
  } catch (err) {
    showAuthError('register-error', err.message);
  } finally {
    btn.classList.remove('btn-loading');
    btn.textContent = 'Crear Cuenta';
  }
});

//  LOGOUT 
document.getElementById('logout-btn').addEventListener('click', () => {
  token    = null;
  authUser = null;
  activities = [];
  clearReminderTicker();
  localStorage.removeItem('rutina_token');
  showAuthScreen();
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
  clearAuthErrors();
});

// 
// DATE HELPERS
// 
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

function getMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return {
    start: new Date(y, m, 1).toISOString().slice(0, 10),
    end:   new Date(y, m + 1, 0).toISOString().slice(0, 10),
  };
}

function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }

function formatDayLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return 'Hoy';
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (diff === 1)  return 'Mañana';
  if (diff === -1) return 'Ayer';
  const [y, m, d] = dateStr.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${months[+m - 1]} ${y}`;
}

function formatTimeRange(ts, te) {
  if (!ts && !te) return '';
  if (ts && te)   return `${ts}  ${te}`;
  if (ts)         return `Inicio: ${ts}`;
  return `Fin: ${te}`;
}

function parseReminderMinutes(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function reminderText(minutes) {
  if (minutes === 0) return 'Al iniciar';
  if (minutes === 60) return '1 hora antes';
  if (minutes === 120) return '2 horas antes';
  return `${minutes} min antes`;
}

function getReminderStore() {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setReminderStore(store) {
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(store));
}

function reminderFingerprint(act) {
  return [
    act._id,
    act.updatedAt || '',
    act.date || '',
    act.timeStart || '',
    act.reminderMinutesBefore ?? '',
  ].join('|');
}

function parseStartTimestamp(act) {
  if (!act.date || !act.timeStart) return null;
  const start = new Date(`${act.date}T${act.timeStart}:00`);
  const ts = start.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function playReminderSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.36);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // Silent fail if browser blocks audio.
  }
}

function maybeShowSystemNotification(act, mins) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const when = mins === 0 ? 'ahora' : reminderText(mins);
  new Notification('Recordatorio de actividad', {
    body: `${act.name} (${when})`,
    tag: `act-${act._id}`,
    renotify: true,
  });
}

function requestNotificationPermissionOnUserAction(reminderMinutes) {
  if (reminderMinutes === null) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {});
}

function triggerReminder(act, mins) {
  const msg = mins === 0
    ? `Empieza ahora: ${act.name}`
    : `Recordatorio: ${act.name} (${reminderText(mins)})`;
  showToast(msg, 'warning');
  playReminderSound();
  maybeShowSystemNotification(act, mins);
}

function clearReminderTicker() {
  if (reminderTicker) {
    clearInterval(reminderTicker);
    reminderTicker = null;
  }
}

function runReminderCheck() {
  if (!activities.length) return;
  const now = Date.now();
  const fired = getReminderStore();
  let changed = false;

  for (const act of activities) {
    if (act.done) continue;
    const mins = Number.isInteger(act.reminderMinutesBefore) ? act.reminderMinutesBefore : null;
    if (mins === null) continue;

    const startTs = parseStartTimestamp(act);
    if (!startTs) continue;

    const triggerTs = startTs - (mins * 60 * 1000);
    const fingerprint = reminderFingerprint(act);

    if (fired[fingerprint]) continue;

    // Fire once if we are between trigger time and 2 minutes after start.
    if (now >= triggerTs && now <= (startTs + 2 * 60 * 1000)) {
      triggerReminder(act, mins);
      fired[fingerprint] = Date.now();
      changed = true;
    }
  }

  if (changed) setReminderStore(fired);
}

function restartReminderEngine() {
  clearReminderTicker();
  runReminderCheck();
  reminderTicker = setInterval(runReminderCheck, REMINDER_TICK_MS);
}

// 
// API  ACTIVITIES
// 
async function loadActivities() {
  const data = await apiFetch('/activities');
  activities = data.data || [];
  restartReminderEngine();
}

// 
// NAVIGATION
// 
let currentView = 'dashboard';

const navItems   = document.querySelectorAll('.nav-item');
const views      = document.querySelectorAll('.view');
const viewTitle  = document.getElementById('view-title');
const todayBadge = document.getElementById('today-badge');

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  schedule:  'Nueva Actividad',
  all:       'Todas las Actividades',
};

function switchView(name) {
  currentView = name;
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === name));
  views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  viewTitle.textContent = VIEW_TITLES[name] || 'Dashboard';
  if (name === 'dashboard') renderDashboard();
  if (name === 'all')       renderCalendar();
}

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    switchView(item.dataset.view);
  });
});

// 
// TOAST
// 
const toast = document.getElementById('toast');
let toastTimer;

function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

// 
// PROGRESS BARS
// 
function setBar(barEl, pctEl, subEl, items) {
  const total = items.length;
  const done  = items.filter(a => a.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  barEl.style.width = pct + '%';
  pctEl.textContent = pct + '%';
  subEl.textContent = `${done} de ${total} actividades completadas`;
}

function renderProgress() {
  const today = todayStr();
  const week  = getWeekRange();
  const month = getMonthRange();
  setBar(
    document.getElementById('bar-day'),   document.getElementById('pct-day'),   document.getElementById('sub-day'),
    activities.filter(a => a.date === today)
  );
  setBar(
    document.getElementById('bar-week'),  document.getElementById('pct-week'),  document.getElementById('sub-week'),
    activities.filter(a => inRange(a.date, week.start, week.end))
  );
  setBar(
    document.getElementById('bar-month'), document.getElementById('pct-month'), document.getElementById('sub-month'),
    activities.filter(a => inRange(a.date, month.start, month.end))
  );
}

// 
// ACTIVITY CARD BUILDER
// 
function buildCard(act, { showDate = false } = {}) {
  const card = document.createElement('div');
  card.className = `activity-card${act.done ? ' done' : ''}`;
  card.dataset.id  = act._id;
  card.dataset.cat = act.category || 'general';

  // Checkbox
  const check = document.createElement('div');
  check.className = `act-check${act.done ? ' checked' : ''}`;
  check.title = act.done ? 'Marcar como pendiente' : 'Marcar como completada';
  check.addEventListener('click', () => toggleDone(act._id));

  // Body
  const body = document.createElement('div');
  body.className = 'act-body';

  const name = document.createElement('div');
  name.className = 'act-name';
  name.textContent = act.name;

  const meta = document.createElement('div');
  meta.className = 'act-meta';

  // Date label
  if (showDate) {
    const dateEl = document.createElement('span');
    dateEl.className = 'act-date';
    dateEl.textContent = '\uD83D\uDCC5 ' + formatDayLabel(act.date);
    meta.appendChild(dateEl);
  }

  // Time range
  const timeRange = formatTimeRange(act.timeStart, act.timeEnd);
  if (timeRange) {
    const timeEl = document.createElement('span');
    timeEl.className = 'act-duration';
    timeEl.textContent = '\uD83D\uDD50 ' + timeRange;
    meta.appendChild(timeEl);
  }

  if (Number.isInteger(act.reminderMinutesBefore)) {
    const reminderEl = document.createElement('span');
    reminderEl.className = 'act-reminder';
    reminderEl.textContent = '\u23F0 ' + reminderText(act.reminderMinutesBefore);
    meta.appendChild(reminderEl);
  }

  // Category badge
  const catNames = { general:'General', salud:'Salud & Bienestar', trabajo:'Trabajo', estudio:'Estudio', personal:'Personal', social:'Social' };
  const cat = act.category || 'general';
  const badge = document.createElement('span');
  badge.className = `act-cat-badge badge-${cat}`;
  badge.textContent = catNames[cat] || cat;
  meta.appendChild(badge);

  // Recurring badge
  if (act.recurrenceGroupId) {
    const recurBadge = document.createElement('span');
    recurBadge.className = 'act-recur-badge';
    recurBadge.title = 'Actividad recurrente';
    recurBadge.textContent = '\uD83D\uDD01 Recurrente';
    meta.appendChild(recurBadge);
  }

  body.appendChild(name);
  body.appendChild(meta);

  if (act.description) {
    const desc = document.createElement('div');
    desc.className = 'act-desc';
    desc.textContent = act.description;
    body.appendChild(desc);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'act-actions';
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon';
  delBtn.title = 'Eliminar';
  delBtn.textContent = '\uD83D\uDDD1';
  delBtn.addEventListener('click', () => deleteActivity(act._id, act.recurrenceGroupId));
  actions.appendChild(delBtn);

  card.appendChild(check);
  card.appendChild(body);
  card.appendChild(actions);
  return card;
}

// 
// RENDER DASHBOARD
// 
function renderDashboard() {
  const today   = todayStr();
  const dayActs = activities
    .filter(a => a.date === today)
    .sort((a, b) => (a.timeStart || '99:99').localeCompare(b.timeStart || '99:99'));

  const todayList  = document.getElementById('today-list');
  const todayCount = document.getElementById('today-count');

  todayCount.textContent = `${dayActs.length} actividad${dayActs.length !== 1 ? 'es' : ''}`;
  todayList.innerHTML = '';

  if (!dayActs.length) {
    todayList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\uD83D\uDCCB</div>
        <p>No hay actividades programadas para hoy.</p>
        <button class="btn-primary" id="empty-add-btn">Agregar actividad</button>
      </div>`;
    document.getElementById('empty-add-btn').addEventListener('click', openModal);
  } else {
    dayActs.forEach(act => todayList.appendChild(buildCard(act)));
  }
  renderProgress();
}

// 
// CALENDAR — All Activities View
// 

// Returns activities matching current filter controls
function getFilteredActivities() {
  const q      = document.getElementById('search-input').value.toLowerCase();
  const cat    = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  return activities.filter(a => {
    const matchQ = !q || a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
    const matchC = !cat || a.category === cat;
    const matchS = !status || (status === 'done' ? a.done : !a.done);
    return matchQ && matchC && matchS;
  });
}

function renderCalendar() {
  calFilteredActs = getFilteredActivities();

  // Build date → activities map
  const actByDate = {};
  calFilteredActs.forEach(a => {
    (actByDate[a.date] = actByDate[a.date] || []).push(a);
  });

  const grid  = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  label.textContent = `${MONTHS[calMonth]} ${calYear}`;
  grid.innerHTML = '';

  // Day-of-week headers (Mon → Sun)
  ['Lun','Mar','Mi\u00e9','Jue','Vie','S\u00e1b','Dom'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-hdr';
    h.textContent = d;
    grid.appendChild(h);
  });

  // First day of month, adjusted so Mon=0
  const firstDow    = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevTotal   = new Date(calYear, calMonth, 0).getDate();
  const today       = todayStr();
  const monthStr    = String(calMonth + 1).padStart(2, '0');

  // Previous-month trailing cells
  const prevYear  = calMonth === 0 ? calYear - 1 : calYear;
  const prevMonth = calMonth === 0 ? 12 : calMonth; // 1-indexed
  for (let i = firstDow - 1; i >= 0; i--) {
    const d    = prevTotal - i;
    const dStr = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    grid.appendChild(makeCalCell(dStr, d, actByDate, today, true));
  }

  // Current-month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${calYear}-${monthStr}-${String(d).padStart(2,'0')}`;
    grid.appendChild(makeCalCell(dStr, d, actByDate, today, false));
  }

  // Next-month leading cells to complete the last row
  const nextYear  = calMonth === 11 ? calYear + 1 : calYear;
  const nextMonth = calMonth === 11 ? 1 : calMonth + 2; // 1-indexed
  const trailing  = (firstDow + daysInMonth) % 7;
  const fill      = trailing === 0 ? 0 : 7 - trailing;
  for (let d = 1; d <= fill; d++) {
    const dStr = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    grid.appendChild(makeCalCell(dStr, d, actByDate, today, true));
  }

  // Refresh panel if a date is still selected
  if (calSelectedDate) renderCalDayPanel(calSelectedDate);
}

function makeCalCell(dateStr, dayNum, actByDate, today, isOther) {
  const cell    = document.createElement('div');
  const classes = ['cal-day'];
  if (isOther)               classes.push('other-month');
  if (dateStr === today)     classes.push('today');
  if (dateStr === calSelectedDate) classes.push('selected');
  cell.className  = classes.join(' ');
  cell.dataset.date = dateStr;

  const num = document.createElement('span');
  num.className   = 'cal-day-num';
  num.textContent = dayNum;
  cell.appendChild(num);

  const dayActs = actByDate[dateStr] || [];
  if (dayActs.length) {
    const dotsEl = document.createElement('div');
    dotsEl.className = 'cal-dots';
    dayActs.slice(0, 5).forEach(a => {
      const dot = document.createElement('span');
      dot.className = `cal-dot cat-${a.category || 'general'}${a.done ? ' done-dot' : ''}`;
      dot.title     = a.name;
      dotsEl.appendChild(dot);
    });
    if (dayActs.length > 5) {
      const more = document.createElement('span');
      more.className   = 'cal-more';
      more.textContent = `+${dayActs.length - 5}`;
      dotsEl.appendChild(more);
    }
    cell.appendChild(dotsEl);
  }

  cell.addEventListener('click', () => {
    if (calSelectedDate === dateStr) {
      // Deselect — close panel
      calSelectedDate = null;
      document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
      document.getElementById('cal-day-panel').classList.remove('open');
    } else {
      calSelectedDate = dateStr;
      document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
      cell.classList.add('selected');
      renderCalDayPanel(dateStr);
    }
  });

  return cell;
}

function renderCalDayPanel(dateStr) {
  const panel   = document.getElementById('cal-day-panel');
  const listEl  = document.getElementById('cal-panel-list');
  const titleEl = document.getElementById('cal-panel-title');

  const dayActs = calFilteredActs
    .filter(a => a.date === dateStr)
    .sort((a, b) => (a.timeStart || '99:99').localeCompare(b.timeStart || '99:99'));

  const [y, m, d] = dateStr.split('-');
  const dt     = new Date(+y, +m - 1, +d);
  const days   = ['Domingo','Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes','S\u00e1bado'];
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  titleEl.textContent = `${days[dt.getDay()]} ${+d} de ${months[+m - 1]} ${y}`;

  listEl.innerHTML = '';

  if (!dayActs.length) {
    const hasFilter = document.getElementById('search-input').value
                   || document.getElementById('filter-category').value
                   || document.getElementById('filter-status').value;
    listEl.innerHTML = `
      <div class="empty-state" style="padding:18px 0;">
        <div class="empty-icon">\uD83D\uDCCB</div>
        <p>${hasFilter ? 'Sin resultados con estos filtros para este d\u00eda.' : 'Sin actividades para este d\u00eda.'}</p>
      </div>`;
  } else {
    dayActs.forEach(act => listEl.appendChild(buildCard(act)));
  }

  panel.classList.add('open');
}

// Close panel button
document.getElementById('cal-panel-close').addEventListener('click', () => {
  calSelectedDate = null;
  document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  document.getElementById('cal-day-panel').classList.remove('open');
});

// Month navigation
document.getElementById('cal-prev').addEventListener('click', () => {
  calSelectedDate = null;
  document.getElementById('cal-day-panel').classList.remove('open');
  if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calSelectedDate = null;
  document.getElementById('cal-day-panel').classList.remove('open');
  if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
  renderCalendar();
});

// 
// TOGGLE DONE
// 
async function toggleDone(id) {
  const act = activities.find(a => a._id === id);
  if (!act) return;
  const newDone = !act.done;
  try {
    const res = await apiFetch(`/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: newDone }),
    });
    const idx = activities.findIndex(a => a._id === id);
    if (idx !== -1) activities[idx] = res.data;
    restartReminderEngine();
    if (currentView === 'dashboard') renderDashboard();
    else renderCalendar();
    showToast(newDone ? 'Actividad completada' : 'Marcada como pendiente');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// 
// DELETE
// 

// Pending delete state (used by the recurrence confirm overlay)
let pendingDeleteId = null;

function showRecurDeleteConfirm(id) {
  pendingDeleteId = id;
  document.getElementById('recur-delete-overlay').classList.add('open');
}
function hideRecurDeleteConfirm() {
  pendingDeleteId = null;
  document.getElementById('recur-delete-overlay').classList.remove('open');
}

// id            - activity _id
// recurrenceGroupId - truthy if this activity belongs to a series
function deleteActivity(id, recurrenceGroupId) {
  if (recurrenceGroupId) {
    showRecurDeleteConfirm(id);
  } else {
    doDelete(id, null);
  }
}

async function doDelete(id, scope) {
  try {
    const url = scope ? `/activities/${id}?scope=${scope}` : `/activities/${id}`;
    await apiFetch(url, { method: 'DELETE' });
    // Reload from server to ensure consistency (especially for 'future' scope)
    await loadActivities();
    hideRecurDeleteConfirm();
    if (currentView === 'dashboard') renderDashboard();
    else renderCalendar();
    const msg = scope === 'future' ? 'Serie de actividades eliminada' : 'Actividad eliminada';
    showToast(msg, 'error');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Recurrence delete overlay buttons
document.getElementById('recur-del-cancel').addEventListener('click', hideRecurDeleteConfirm);
document.getElementById('recur-del-cancel-x').addEventListener('click', hideRecurDeleteConfirm);
document.getElementById('recur-del-one').addEventListener('click', () => {
  if (pendingDeleteId) doDelete(pendingDeleteId, null);
});
document.getElementById('recur-del-future').addEventListener('click', () => {
  if (pendingDeleteId) doDelete(pendingDeleteId, 'future');
});
document.getElementById('recur-delete-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'recur-delete-overlay') hideRecurDeleteConfirm();
});

// 
// ADD ACTIVITY
// Returns: a single Activity object (non-recurrent) or an array (recurrent)
// 
async function addActivity(data) {
  const res = await apiFetch('/activities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  // Recurrent creation returns an array
  if (Array.isArray(res.data)) {
    activities.push(...res.data);
    restartReminderEngine();
    return res.data;          // array
  }
  activities.push(res.data);
  restartReminderEngine();
  return res.data;            // single object
}

// 
// VALIDATION HELPERS
// 
function validateFields({ nameEl, dateEl, timeStartEl, timeEndEl, errNameEl, errDateEl, errTimeEl }) {
  let ok = true;
  errNameEl.textContent = '';
  errDateEl.textContent = '';
  if (errTimeEl) errTimeEl.textContent = '';
  nameEl.classList.remove('invalid');
  dateEl.classList.remove('invalid');

  if (!nameEl.value.trim()) {
    errNameEl.textContent = 'El nombre es obligatorio.';
    nameEl.classList.add('invalid');
    ok = false;
  }
  if (!dateEl.value) {
    errDateEl.textContent = 'La fecha es obligatoria.';
    dateEl.classList.add('invalid');
    ok = false;
  }
  if (timeStartEl && timeEndEl && timeStartEl.value && timeEndEl.value) {
    if (timeEndEl.value < timeStartEl.value) {
      if (errTimeEl) errTimeEl.textContent = 'La hora de fin debe ser posterior a la de inicio.';
      timeEndEl.classList.add('invalid');
      ok = false;
    } else {
      timeEndEl.classList.remove('invalid');
    }
  }
  return ok;
}

// 
// SCHEDULE FORM
// 
const actForm      = document.getElementById('activity-form');
const actName      = document.getElementById('act-name');
const actDate      = document.getElementById('act-date');
const actTimeStart = document.getElementById('act-time-start');
const actTimeEnd   = document.getElementById('act-time-end');
const actCat       = document.getElementById('act-category');
const actDesc      = document.getElementById('act-desc');
const actReminder  = document.getElementById('act-reminder');
const saveFormBtn  = document.getElementById('save-form-btn');

// ─ Recurrence controls ─
const actRecurEnabled = document.getElementById('act-recur-enabled');
const actRecurSection = document.getElementById('act-recur-section');
const actRecurFreq    = document.getElementById('act-recur-freq');
const actRecurEnd     = document.getElementById('act-recur-end');
const actRecurDaysGrp = document.getElementById('act-recur-days-group');

// Toggle recurrence panel
actRecurEnabled.addEventListener('change', () => {
  actRecurSection.classList.toggle('open', actRecurEnabled.checked);
  if (actRecurEnabled.checked) {
    // Set minimum end date when panel opens
    updateRecurEndMin();
  }
});

// Show/hide days-of-week group based on frequency
actRecurFreq.addEventListener('change', () => {
  actRecurDaysGrp.style.display = actRecurFreq.value === 'weekly' ? '' : 'none';
});

// Keep 'Repetir hasta' minimum in sync with start date
actDate.addEventListener('change', updateRecurEndMin);
function updateRecurEndMin() {
  if (actDate.value) {
    actRecurEnd.min = actDate.value;
    // Advance default to 1 month ahead if not yet set
    if (!actRecurEnd.value || actRecurEnd.value <= actDate.value) {
      const d = new Date(actDate.value + 'T00:00:00');
      d.setMonth(d.getMonth() + 1);
      actRecurEnd.value = d.toISOString().slice(0, 10);
    }
  }
}

actForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valid = validateFields({
    nameEl:      actName,
    dateEl:      actDate,
    timeStartEl: actTimeStart,
    timeEndEl:   actTimeEnd,
    errNameEl:   document.getElementById('err-name'),
    errDateEl:   document.getElementById('err-date'),
    errTimeEl:   document.getElementById('err-time'),
  });
  if (!valid) return;

  const reminderMinutesBefore = parseReminderMinutes(actReminder.value);
  if (reminderMinutesBefore !== null && !actTimeStart.value) {
    document.getElementById('err-time').textContent = 'Para usar alerta debes indicar hora de inicio.';
    actTimeStart.classList.add('invalid');
    return;
  }
  requestNotificationPermissionOnUserAction(reminderMinutesBefore);

  // ─ Validate recurrence fields if enabled ─
  let recurrence = null;
  if (actRecurEnabled.checked) {
    const freq    = actRecurFreq.value;
    const endDt   = actRecurEnd.value;
    const daysEls = document.querySelectorAll('input[name="act-dow"]:checked');
    const dow     = [...daysEls].map(el => Number(el.value));

    const errEnd  = document.getElementById('err-recur-end');
    const errDays = document.getElementById('err-recur-days');
    errEnd.textContent  = '';
    errDays.textContent = '';

    if (!endDt) {
      errEnd.textContent = 'Indica hasta cuándo se repite.';
      return;
    }
    if (endDt <= actDate.value) {
      errEnd.textContent = 'La fecha de fin debe ser posterior a la fecha de inicio.';
      return;
    }
    if (freq === 'weekly' && dow.length === 0) {
      errDays.textContent = 'Selecciona al menos un día de la semana.';
      return;
    }
    recurrence = { enabled: true, frequency: freq, daysOfWeek: dow, endDate: endDt };
  }

  saveFormBtn.textContent = 'Guardando...';
  saveFormBtn.classList.add('btn-loading');

  try {
    const result = await addActivity({
      name:        actName.value,
      date:        actDate.value,
      timeStart:   actTimeStart.value,
      timeEnd:     actTimeEnd.value,
      category:    actCat.value,
      description: actDesc.value,
      reminderMinutesBefore,
      recurrence,
    });
    const count = Array.isArray(result) ? result.length : 1;
    const msg   = count > 1
      ? `${count} actividades programadas correctamente`
      : 'Actividad guardada correctamente';
    showToast(msg);
    actForm.reset();
    actDate.value = todayStr();
    actRecurSection.classList.remove('open');
    document.getElementById('err-recur-end').textContent  = '';
    document.getElementById('err-recur-days').textContent = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    saveFormBtn.textContent = 'Guardar Actividad';
    saveFormBtn.classList.remove('btn-loading');
  }
});

document.getElementById('clear-form-btn').addEventListener('click', () => {
  actForm.reset();
  actDate.value = todayStr();
  actRecurSection.classList.remove('open');
  ['err-name','err-date','err-time','err-recur-end','err-recur-days']
    .forEach(id => document.getElementById(id).textContent = '');
  [actName, actDate, actTimeEnd].forEach(el => el.classList.remove('invalid'));
});

// 
// MODAL
// 
const modalOverlay = document.getElementById('modal-overlay');
const mName        = document.getElementById('m-name');
const mDate        = document.getElementById('m-date');
const mTimeStart   = document.getElementById('m-time-start');
const mTimeEnd     = document.getElementById('m-time-end');
const mCat         = document.getElementById('m-category');
const mDesc        = document.getElementById('m-desc');
const mReminder    = document.getElementById('m-reminder');
const modalSaveBtn = document.getElementById('modal-save-btn');

function openModal() {
  mDate.value = todayStr();
  modalOverlay.classList.add('open');
  setTimeout(() => mName.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.getElementById('modal-form').reset();
  ['merr-name','merr-date','merr-time'].forEach(id => document.getElementById(id).textContent = '');
  [mName, mDate, mTimeEnd].forEach(el => el.classList.remove('invalid'));
}

document.getElementById('open-modal-btn').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valid = validateFields({
    nameEl:      mName,
    dateEl:      mDate,
    timeStartEl: mTimeStart,
    timeEndEl:   mTimeEnd,
    errNameEl:   document.getElementById('merr-name'),
    errDateEl:   document.getElementById('merr-date'),
    errTimeEl:   document.getElementById('merr-time'),
  });
  if (!valid) return;

  const reminderMinutesBefore = parseReminderMinutes(mReminder.value);
  if (reminderMinutesBefore !== null && !mTimeStart.value) {
    document.getElementById('merr-time').textContent = 'Para usar alerta debes indicar hora de inicio.';
    mTimeStart.classList.add('invalid');
    return;
  }
  requestNotificationPermissionOnUserAction(reminderMinutesBefore);

  modalSaveBtn.textContent = 'Guardando...';
  modalSaveBtn.classList.add('btn-loading');

  try {
    await addActivity({
      name:        mName.value,
      date:        mDate.value,
      timeStart:   mTimeStart.value,
      timeEnd:     mTimeEnd.value,
      category:    mCat.value,
      description: mDesc.value,
      reminderMinutesBefore,
    });
    closeModal();
    showToast('Actividad guardada correctamente');
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'all') renderAll();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    modalSaveBtn.textContent = 'Guardar';
    modalSaveBtn.classList.remove('btn-loading');
  }
});

// 
// FILTERS (Calendar view — live update)
// 
document.getElementById('search-input').addEventListener('input',    renderCalendar);
document.getElementById('filter-category').addEventListener('change', renderCalendar);
document.getElementById('filter-status').addEventListener('change',   renderCalendar);

// 
// TOPBAR DATE BADGE
// 
function updateBadge() {
  const d = new Date();
  const days   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  document.getElementById('today-badge').textContent =
    `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function setDefaultDates() {
  const today = todayStr();
  if (actDate) actDate.value = today;
  if (mDate)   mDate.value   = today;
}

// 
// INIT  check existing session
// 
async function init() {
  if (!token) {
    showAuthScreen();
    return;
  }
  try {
    const data = await apiFetch('/auth/me');
    await loadActivities();
    showApp(data.user);
  } catch {
    token = null;
    localStorage.removeItem('rutina_token');
    showAuthScreen();
  }
}

init();