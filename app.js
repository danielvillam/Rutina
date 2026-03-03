//  Config 
const API = '/api';   // Relative  served by Express on same origin

//  Auth token 
let token    = localStorage.getItem('rutina_token') || null;
let authUser = null;   // { id, username }

//  In-memory activities cache 
let activities = [];

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

// 
// API  ACTIVITIES
// 
async function loadActivities() {
  const data = await apiFetch('/activities');
  activities = data.data || [];
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
  if (name === 'all')       renderAll();
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

  // Category badge
  const catNames = { general:'General', salud:'Salud & Bienestar', trabajo:'Trabajo', estudio:'Estudio', personal:'Personal', social:'Social' };
  const cat = act.category || 'general';
  const badge = document.createElement('span');
  badge.className = `act-cat-badge badge-${cat}`;
  badge.textContent = catNames[cat] || cat;
  meta.appendChild(badge);

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
  delBtn.addEventListener('click', () => deleteActivity(act._id));
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
// RENDER ALL ACTIVITIES
// 
function renderAll() {
  const allList = document.getElementById('all-list');
  const q       = document.getElementById('search-input').value.toLowerCase();
  const cat     = document.getElementById('filter-category').value;
  const status  = document.getElementById('filter-status').value;

  const filtered = [...activities]
    .filter(a => {
      const matchQ = !q || a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
      const matchC = !cat || a.category === cat;
      const matchS = !status || (status === 'done' ? a.done : !a.done);
      return matchQ && matchC && matchS;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (a.timeStart || '').localeCompare(b.timeStart || ''));

  allList.innerHTML = '';
  if (!filtered.length) {
    allList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\uD83D\uDD0D</div>
        <p>${activities.length ? 'No hay resultados con esos filtros.' : 'Aún no has creado ninguna actividad.'}</p>
      </div>`;
    return;
  }
  filtered.forEach(act => allList.appendChild(buildCard(act, { showDate: true })));
}

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
    if (currentView === 'dashboard') renderDashboard();
    else renderAll();
    showToast(newDone ? 'Actividad completada' : 'Marcada como pendiente');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// 
// DELETE
// 
async function deleteActivity(id) {
  try {
    await apiFetch(`/activities/${id}`, { method: 'DELETE' });
    activities = activities.filter(a => a._id !== id);
    if (currentView === 'dashboard') renderDashboard();
    else renderAll();
    showToast('Actividad eliminada', 'error');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// 
// ADD ACTIVITY
// 
async function addActivity(data) {
  const res = await apiFetch('/activities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  activities.push(res.data);
  return res.data;
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
const saveFormBtn  = document.getElementById('save-form-btn');

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

  saveFormBtn.textContent = 'Guardando...';
  saveFormBtn.classList.add('btn-loading');

  try {
    await addActivity({
      name:        actName.value,
      date:        actDate.value,
      timeStart:   actTimeStart.value,
      timeEnd:     actTimeEnd.value,
      category:    actCat.value,
      description: actDesc.value,
    });
    showToast('Actividad guardada correctamente');
    actForm.reset();
    actDate.value = todayStr();
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
  ['err-name','err-date','err-time'].forEach(id => document.getElementById(id).textContent = '');
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
// FILTERS (All Activities view)
// 
document.getElementById('search-input').addEventListener('input',    renderAll);
document.getElementById('filter-category').addEventListener('change', renderAll);
document.getElementById('filter-status').addEventListener('change',   renderAll);

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