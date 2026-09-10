const state = { user: null, classes: [], tasks: [], selectedClassId: null, timer: null };
let dashboardRequest = 0;
let syncInFlight = false;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;

const showFeedback = (message, type = 'success') => {
  const feedback = $('#feedback');
  $('#feedback-message').textContent = message;
  feedback.className = `feedback show ${type === 'error' ? 'error' : ''}`;
  window.clearTimeout(showFeedback.timeout);
  showFeedback.timeout = window.setTimeout(() => feedback.classList.remove('show'), 3500);
};
$('#feedback-close').addEventListener('click', () => $('#feedback').classList.remove('show'));

const setSync = (text, syncing = false) => {
  $('#sync-status').innerHTML = `<i></i> ${text}`;
  $('#sync-status').classList.toggle('syncing', syncing);
};

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let data = {};
  try { data = await response.json(); } catch (_) { /* respuesta sin cuerpo */ }
  if (response.status === 401) {
    window.location.href = '/login?next=/teacher';
    throw new Error('Tu sesión expiró.');
  }
  if (response.status === 403) throw new Error('No tienes permisos para esta acción.');
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la acción.');
  return data;
};

const readAiStream = async (url, payload, onText) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload), signal: controller.signal });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'La asistencia IA no está disponible.'); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let content = '';
    while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const events = buffer.split('\n\n'); buffer = events.pop() || ''; for (const event of events) { const line = event.split('\n').find((item) => item.startsWith('data:')); if (!line) continue; const data = JSON.parse(line.slice(5).trim()); if (data.error) throw new Error(data.error); if (data.text) { content += data.text; onText(data.text, content); } } if (done) break; }
    return content;
  } catch (error) { if (error.name === 'AbortError') throw new Error('La asistencia IA está tardando demasiado. Inténtalo de nuevo.'); throw error; } finally { window.clearTimeout(timeout); }
};

const formatDate = (date) => date ? new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'Sin fecha';

const renderClassCard = (item) => `<article class="class-card" data-class-id="${item.id}">
  <div class="class-card-top"><span class="class-mark">${icon('book')}</span><span class="class-code">${item.joinCode}</span></div>
  <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.subject)}${item.grade ? ` · ${escapeHtml(item.grade)}` : ''}${item.groupName ? ` · Grupo ${escapeHtml(item.groupName)}` : ''}</p>
  <div class="class-meta"><span><strong>${item.studentCount}</strong> estudiantes</span><span><strong>${item.taskCount}</strong> actividades</span></div>
  <div class="class-card-actions"><button data-edit-class="${item.id}">Editar</button><button data-invite-class="${item.id}">Invitar</button><button data-delete-class="${item.id}">Eliminar</button></div>
</article>`;

const renderTask = (item, compact = false) => `<article class="task-item" data-task-id="${item.id}">
  <span class="task-dot published"></span><div class="task-item-main"><strong>${escapeHtml(item.title)}</strong><small>${className(item.classId)} · Publicada${item.dueDate ? ` · Entrega ${formatDate(item.dueDate)}` : ''}</small></div>
  <button class="task-action" data-edit-task="${item.id}">Editar</button><button class="task-action danger-text" data-delete-task="${item.id}">Eliminar</button>
</article>`;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const className = (id) => state.classes.find((item) => item.id === id)?.name || 'Aula';

const render = () => {
  $('#stat-classes').textContent = state.classes.length;
  $('#stat-students').textContent = state.classes.reduce((sum, item) => sum + item.studentCount, 0);
  $('#stat-tasks').textContent = state.tasks.length;
  $('#stat-published').textContent = state.tasks.filter((item) => item.status === 'published').length;
  $('#class-list').innerHTML = state.classes.slice(0, 4).map(renderClassCard).join('');
  $('#all-class-list').innerHTML = state.classes.map(renderClassCard).join('');
  $('#recent-tasks').innerHTML = state.tasks.slice(0, 5).map((item) => renderTask(item, true)).join('');
  $('#all-task-list').innerHTML = state.tasks.map((item) => renderTask(item)).join('');
  $('#class-empty').hidden = state.classes.length > 0;
  $('#all-class-empty').hidden = state.classes.length > 0;
  $('#task-empty').hidden = state.tasks.length > 0;
  $('#all-task-empty').hidden = state.tasks.length > 0;
};

const loadSubmissions = async () => {
  try {
    const data = await api('/api/teacher/submissions');
    const filesBySubmission = data.files.reduce((map, file) => { (map[file.submissionId] ||= []).push(file); return map; }, {});
    $('#submission-list').innerHTML = data.submissions.map((item) => `<article class="submission-card"><div class="submission-header"><div><strong>${escapeHtml(item.studentName)} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.className)} · ${item.submittedAt ? formatDate(item.submittedAt) : 'sin fecha'}</small></div><span class="role-pill">${item.grade === null ? 'PENDIENTE' : `${item.grade}/100`}</span></div><div class="submission-answer">${escapeHtml(item.answer || 'El alumno entregó archivos sin texto.')}</div><div class="file-list">${(filesBySubmission[item.id] || []).map((file) => `<a class="file-link" href="${file.url}" target="_blank" rel="noopener">↧ ${escapeHtml(file.name)} (${Math.ceil(file.size / 1024)} KB)</a>`).join('')}</div><form class="grade-form" data-grade-submission="${item.id}"><input name="grade" type="number" min="0" max="100" step="1" placeholder="Nota" value="${item.grade ?? ''}" required><textarea name="feedback" placeholder="Retroalimentación">${escapeHtml(item.feedback || '')}</textarea><button class="ai-evaluate" type="button" data-ai-evaluate="${item.id}">✦ Evaluar IA</button><button class="primary-button" type="submit">Guardar</button></form></article>`).join('');
    $('#submission-empty').hidden = data.submissions.length > 0;
  } catch (error) { showFeedback(error.message, 'error'); }
};

const loadDashboard = async (quiet = false) => {
  if (document.hidden || syncInFlight) return;
  syncInFlight = true;
  const requestId = ++dashboardRequest;
  setSync('Actualizando…', true);
  try {
    const data = await api('/api/teacher/dashboard');
    if (requestId !== dashboardRequest) return;
    state.user = data.user;
    state.classes = data.classes;
    state.tasks = data.tasks;
    const firstName = state.user.name.split(' ')[0];
    $('#welcome-name').textContent = firstName;
    $('#sidebar-name').textContent = state.user.name;
    $('#settings-name').textContent = state.user.name;
    $('#settings-email').textContent = state.user.email;
    $$('.avatar').forEach((avatar) => { avatar.textContent = firstName.charAt(0).toUpperCase(); });
    render();
    setSync('Sincronizado');
    if (!quiet) showFeedback('Datos actualizados');
  } catch (error) {
    if (requestId !== dashboardRequest) return;
    setSync('Sin conexión', false);
    if (!quiet && error.message !== 'Tu sesión expiró.') showFeedback(error.message, 'error');
  } finally {
    syncInFlight = false;
  }
};

const refreshAfterChange = async () => {
  window.clearTimeout(state.timer);
  while (syncInFlight) await new Promise((resolve) => setTimeout(resolve, 60));
  await loadDashboard(true);
  scheduleSync();
};

const scheduleSync = () => {
  window.clearTimeout(state.timer);
  if (document.hidden) return;
  // Un pequeño jitter evita que todos los clientes consulten exactamente en el mismo segundo.
  const delay = 10000 + Math.floor(Math.random() * 7000);
  state.timer = window.setTimeout(async () => {
    await loadDashboard(true);
    scheduleSync();
  }, delay);
};

const showView = async (view) => {
  try {
    const session = await api('/api/session');
    if (!session.authenticated || session.user.role !== 'teacher') {
      window.location.href = '/login?next=/teacher';
      return;
    }
  } catch (_) { return; }
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $('#page-title').innerHTML = view === 'overview' ? `Buenos días, <em id="welcome-name">${escapeHtml(state.user.name.split(' ')[0])}</em>.` : ({ classes: 'Mis aulas', tasks: 'Actividades', submissions: 'Entregas', settings: 'Mi espacio' }[view]);
  if (view === 'submissions') loadSubmissions();
};

const modalLegacy = (type) => {
  const form = $('#modal-form');
  const isTask = type === 'task';
  $('#modal-kicker').textContent = isTask ? 'NUEVA ACTIVIDAD' : 'NUEVO ESPACIO';
  $('#modal-title').textContent = isTask ? 'Crea una actividad' : 'Crea un aula';
  $('#modal-description').textContent = isTask ? 'Guarda primero como borrador y publícala cuando esté lista.' : 'Un lugar claro para reunir a tus estudiantes.';
  form.innerHTML = isTask ? `<div class="form-grid"><label>Aula<select name="classId" required>${state.classes.map((item) => `<option value="${item.id}" ${item.id === state.selectedClassId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><label>Título<input name="title" maxlength="140" placeholder="Ej. Funciones cuadráticas" required></label><label>Instrucciones<textarea name="instructions" maxlength="3000" placeholder="¿Qué tendrán que hacer tus estudiantes?" required></textarea></label><label>Objetivos de aprendizaje<textarea name="objectives" maxlength="1000" placeholder="Ej. Identificar y resolver…"></textarea></label><label>Fecha de entrega<input name="dueDate" type="date"></label><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Guardar borrador</button></div></div>` : `<div class="form-grid"><label>Nombre del aula<input name="name" maxlength="100" placeholder="Ej. Matemáticas II" required></label><label>Materia<input name="subject" maxlength="80" placeholder="Ej. Matemáticas" required></label><div class="optional-title">Información opcional <span>puedes completarla después</span></div><div class="form-two"><label>Ciclo escolar<input name="schoolCycle" maxlength="80" placeholder="2026–2027"></label><label>Grado<input name="grade" maxlength="50" placeholder="3° de secundaria"></label></div><div class="form-two"><label>Grupo<input name="groupName" maxlength="50" placeholder="A, B o 1"></label><label>Calendario<input name="calendar" maxlength="120" placeholder="Lun y Mié · 8:00–9:00"></label></div><label>Descripción<textarea name="description" maxlength="500" placeholder="Una breve descripción (opcional)"></textarea></label><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Crear aula</button></div></div>`;
  $('#modal-backdrop').hidden = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const response = await api(isTask ? '/api/teacher/tasks' : '/api/teacher/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (isTask) state.selectedClassId = response.task.classId;
      $('#modal-backdrop').hidden = true;
      await refreshAfterChange();
      showFeedback(isTask ? 'Actividad guardada como borrador' : `Aula creada · código ${response.class.joinCode}`);
    } catch (error) { $('#modal-error').textContent = error.message; submit.disabled = false; }
  };
};

const modal = (type, id = null) => {
  const form = $('#modal-form');
  const isTask = type === 'task' || type === 'edit-task';
  const isEdit = type === 'edit-class' || type === 'edit-task';
  const classroom = state.classes.find((item) => item.id === id);
  const task = state.tasks.find((item) => item.id === id);
  if (type === 'edit-task' && !task) { showFeedback('La actividad ya no está disponible. Actualiza el panel e inténtalo de nuevo.', 'error'); return; }
  if (type === 'delete-class') {
    $('#modal-kicker').textContent = 'ACCIÓN PERMANENTE';
    $('#modal-title').textContent = 'Eliminar aula';
    $('#modal-description').textContent = `Se eliminarán ${classroom?.name || 'el aula'}, sus actividades e invitaciones. Esta acción no se puede deshacer.`;
    form.innerHTML = `<div class="form-grid"><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button danger-button" id="confirm-delete" type="submit" disabled>Espera 3 segundos…</button></div></div>`;
    $('#modal-backdrop').hidden = false;
    let seconds = 3;
    const countdown = window.setInterval(() => { seconds -= 1; const button = $('#confirm-delete'); if (!button) return window.clearInterval(countdown); if (seconds <= 0) { button.disabled = false; button.textContent = 'Eliminar definitivamente'; window.clearInterval(countdown); } else button.textContent = `Espera ${seconds} segundos…`; }, 1000);
    form.onsubmit = async (event) => { event.preventDefault(); try { await api(`/api/teacher/classes/${id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); $('#modal-backdrop').hidden = true; await refreshAfterChange(); showFeedback('Aula eliminada'); } catch (error) { $('#modal-error').textContent = error.message; } };
    return;
  }
  if (type === 'invite') {
    $('#modal-kicker').textContent = 'INVITAR ESTUDIANTE'; $('#modal-title').textContent = `Suma a alguien a ${classroom?.name || 'tu aula'}`; $('#modal-description').textContent = 'Si el correo ya está registrado, se unirá de inmediato. Si no, quedará una invitación pendiente.';
    form.innerHTML = `<div class="form-grid"><label>Correo del estudiante<input name="email" type="email" placeholder="estudiante@correo.com" required></label><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Enviar invitación</button></div></div>`;
    $('#modal-backdrop').hidden = false;
    form.onsubmit = async (event) => { event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true; try { const response = await api(`/api/teacher/classes/${id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) }); $('#modal-backdrop').hidden = true; showFeedback(response.result === 'joined' ? 'Estudiante unido al aula' : 'Invitación guardada'); await refreshAfterChange(); } catch (error) { $('#modal-error').textContent = error.message; submit.disabled = false; } };
    return;
  }
  $('#modal-kicker').textContent = isTask ? (isEdit ? 'EDITAR ACTIVIDAD' : 'NUEVA ACTIVIDAD') : (isEdit ? 'EDITAR AULA' : 'NUEVO ESPACIO');
  $('#modal-title').textContent = isTask ? (isEdit ? 'Edita la actividad' : 'Crea una actividad') : (isEdit ? 'Edita el aula' : 'Crea un aula');
  $('#modal-description').textContent = isTask ? 'Puedes guardar como borrador y publicar cuando esté lista.' : 'Los datos opcionales pueden completarse después.';
  const value = (key) => escapeHtml(isTask ? (task?.[key] || '') : (classroom?.[key] || ''));
  const currentDue = value('dueDate').replace(' ', 'T');
  const dueDate = currentDue ? currentDue.slice(0, 10) : '';
  const dueTime = currentDue ? currentDue.slice(11, 16) : '23:59';
  form.innerHTML = isTask ? `<div class="form-grid"><label>Aula<select name="classId" required>${state.classes.map((item) => `<option value="${item.id}" ${item.id === (task?.classId || state.selectedClassId) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><label>Título<input name="title" maxlength="140" value="${value('title')}" placeholder="Ej. Funciones cuadráticas" required></label><label>Tema para asistencia IA <span class="field-hint">opcional</span><div class="ai-input"><input name="aiTopic" placeholder="Ej. fracciones equivalentes"><button type="button" id="ai-generate">✦ Crear borrador</button></div><div class="ai-progress" id="ai-progress" hidden><span></span><b>La asistencia IA está preparando tu actividad…</b></div><pre id="ai-live-output" class="ai-live-output" hidden></pre></label><label>Instrucciones<textarea name="instructions" maxlength="3000" required>${value('instructions')}</textarea></label><label>Objetivos de aprendizaje<textarea name="objectives" maxlength="1000">${value('objectives')}</textarea></label><div class="form-two"><label>Fecha de entrega<input name="dueDate" type="date" value="${dueDate}" required></label><label>Hora de entrega<input name="dueTime" type="time" value="${dueTime}" required></label></div><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">${isEdit ? 'Guardar cambios' : 'Publicar actividad'}</button></div></div>` : `<div class="form-grid"><label>Nombre del aula<input name="name" maxlength="100" value="${value('name')}" required></label><label>Materia<input name="subject" maxlength="80" value="${value('subject')}" required></label><div class="optional-title">Información opcional <span>puedes completarla después</span></div><div class="form-two"><label>Ciclo escolar<input name="schoolCycle" maxlength="80" value="${value('schoolCycle')}" placeholder="2026–2027"></label><label>Grado<input name="grade" maxlength="50" value="${value('grade')}" placeholder="3° de secundaria"></label></div><div class="form-two"><label>Grupo<input name="groupName" maxlength="50" value="${value('groupName')}" placeholder="A, B o 1"></label><label>Calendario<input name="calendar" maxlength="120" value="${value('calendar')}" placeholder="Lun y Mié · 8:00–9:00"></label></div><label>Descripción<textarea name="description" maxlength="500">${value('description')}</textarea></label><p class="modal-error" id="modal-error"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">${isEdit ? 'Guardar cambios' : 'Crear aula'}</button></div></div>`;
  $('#modal-backdrop').hidden = false;
  $('#ai-generate')?.addEventListener('click', async () => { const topic = form.elements.aiTopic.value.trim(); if (!topic) { $('#modal-error').textContent = 'Escribe un tema para usar la asistencia IA.'; return; } const button = $('#ai-generate'); const progress = $('#ai-progress'); const liveOutput = $('#ai-live-output'); const controls = [...form.elements]; button.disabled = true; controls.forEach((control) => { if (control !== button) control.disabled = true; }); progress.hidden = false; liveOutput.hidden = false; liveOutput.textContent = ''; try { const content = await readAiStream('/api/teacher/ai-draft-stream', { topic }, (piece, full) => { liveOutput.textContent = full; liveOutput.scrollTop = liveOutput.scrollHeight; }); const section = (label, next) => { const match = content.match(new RegExp(`\\*${label}:\\*\\s*([\\s\\S]*?)(?=\\n\\*${next}:\\*|$)`, 'i')); return match ? match[1].trim() : ''; }; const title = section('Título', 'Objetivo') || topic; const objective = section('Objetivo', 'Instrucciones'); const instructions = [section('Instrucciones', '5 ejercicios'), section('5 ejercicios', '2 problemas aplicados'), section('2 problemas aplicados', 'Criterios de evaluación'), section('Criterios de evaluación', '___')].filter(Boolean).join('\n\n'); form.elements.title.value = title.replace(/^\*+|\*+$/g, '').trim(); form.elements.instructions.value = instructions || content; form.elements.objectives.value = objective; showFeedback('Actividad generada; revisa el contenido antes de publicar'); } catch (error) { $('#modal-error').textContent = error.message; showFeedback(error.message, 'error'); } finally { button.disabled = false; controls.forEach((control) => { control.disabled = false; }); progress.hidden = true; } });
  form.onsubmit = async (event) => { event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true; const payload = Object.fromEntries(new FormData(form)); if (isTask) payload.dueDate = `${payload.dueDate}T${payload.dueTime}`; const endpoint = isTask ? (isEdit ? `/api/teacher/tasks/${id}/edit` : '/api/teacher/tasks') : (isEdit ? `/api/teacher/classes/${id}/edit` : '/api/teacher/classes'); try { const response = await api(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (isTask && !isEdit) state.selectedClassId = response.task.classId; $('#modal-backdrop').hidden = true; await refreshAfterChange(); showFeedback(isEdit ? 'Cambios guardados' : isTask ? 'Actividad publicada' : `Aula creada · código ${response.class.joinCode}`); } catch (error) { $('#modal-error').textContent = error.message; submit.disabled = false; } };
};

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { await showView(viewButton.dataset.view); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new-class') { modal('class'); return; }
  if (action === 'new-task') { if (!state.classes.length) { showFeedback('Crea un aula antes de agregar actividades.', 'error'); return; } modal('task'); return; }
  if (action === 'new-task-ai') { if (!state.classes.length) { showFeedback('Crea un aula antes de agregar actividades.', 'error'); return; } modal('task'); return; }
  const editClass = event.target.closest('[data-edit-class]')?.dataset.editClass;
  if (editClass) { modal('edit-class', Number(editClass)); return; }
  const inviteClass = event.target.closest('[data-invite-class]')?.dataset.inviteClass;
  if (inviteClass) { modal('invite', Number(inviteClass)); return; }
  const deleteClass = event.target.closest('[data-delete-class]')?.dataset.deleteClass;
  if (deleteClass) { modal('delete-class', Number(deleteClass)); return; }
  const editTask = event.target.closest('[data-edit-task]')?.dataset.editTask;
  if (editTask) { modal('edit-task', Number(editTask)); return; }
  const deleteTask = event.target.closest('[data-delete-task]')?.dataset.deleteTask;
  if (deleteTask) {
    if (!window.confirm('¿Eliminar esta actividad y sus entregas? Esta acción no se puede deshacer.')) return;
    const button = event.target.closest('[data-delete-task]'); button.disabled = true;
    try { await api(`/api/teacher/tasks/${deleteTask}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await refreshAfterChange(); showFeedback('Actividad eliminada'); } catch (error) { button.disabled = false; showFeedback(error.message, 'error'); }
    return;
  }
  const gradeForm = event.target.closest('[data-grade-submission]');
  if (gradeForm) {
    event.preventDefault();
    const submissionId = gradeForm.dataset.gradeSubmission;
    try { await api(`/api/teacher/submissions/${submissionId}/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(gradeForm))) }); showFeedback('Calificación guardada'); await loadSubmissions(); } catch (error) { showFeedback(error.message, 'error'); }
    return;
  }
  const aiEvaluate = event.target.closest('[data-ai-evaluate]')?.dataset.aiEvaluate;
  if (aiEvaluate) {
    const button = event.target.closest('[data-ai-evaluate]');
    button.disabled = true; button.textContent = 'Evaluando…';
    try {
      const data = await api('/api/teacher/ai-evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: Number(aiEvaluate) }) });
      const form = button.closest('form'); form.elements.grade.value = Math.round(data.evaluation.suggestedGrade); form.elements.feedback.value = data.evaluation.feedback; showFeedback('Propuesta IA lista; revísala antes de guardar');
    } catch (error) { showFeedback(error.message, 'error'); } finally { button.disabled = false; button.textContent = '✦ Evaluar IA'; }
    return;
  }
  const card = event.target.closest('[data-class-id]');
  if (card) { state.selectedClassId = Number(card.dataset.classId); await showView('tasks'); if (state.classes.find((item) => item.id === state.selectedClassId)) showFeedback(`Aula seleccionada: ${className(state.selectedClassId)}`); }
  if (event.target.closest('[data-close-modal]') || event.target.id === 'modal-close' || event.target.id === 'modal-backdrop') $('#modal-backdrop').hidden = true;
});

$('#refresh-button').addEventListener('click', () => loadDashboard());
const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };
$('#logout-button').addEventListener('click', logout);
$('#settings-logout').addEventListener('click', logout);
$('#refresh-submissions')?.addEventListener('click', loadSubmissions);
loadDashboard(true);
scheduleSync();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    window.clearTimeout(state.timer);
    setSync('En pausa');
    return;
  }
  loadDashboard(true).finally(scheduleSync);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const renameAiAction = () => { const button = document.querySelector('#ai-generate'); if (button) button.textContent = '✦ Crear actividad con IA'; };
new MutationObserver(renameAiAction).observe(document.body, { childList: true, subtree: true });
