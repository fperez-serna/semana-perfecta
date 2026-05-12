let METAS_DATA = null;

const NIVEL_ORDEN = ['10', '5', '2', '1', '6m'];

const NIVEL_COLORES = {
  '10': { bg: '#111111', text: '#FFFFFF' },
  '5':  { bg: '#444444', text: '#FFFFFF' },
  '2':  { bg: '#777777', text: '#FFFFFF' },
  '1':  { bg: '#AAAAAA', text: '#FFFFFF' },
  '6m': { bg: '#DDDDDD', text: '#333333' },
};

const NIVEL_LABELS = {
  '10': 'A 10 años',
  '5':  'A 5 años',
  '2':  'A 2 años',
  '1':  'A 1 año',
  '6m': 'A 6 meses',
};

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Caché de datos Firestore
let progresoCache = {};
let notasCache = {};
let avancesCache = {};
let semanaEditsCache = {};

async function init() {
  try {
    const res = await fetch('data/metas.json');
    METAS_DATA = await res.json();
  } catch (e) {
    document.body.innerHTML = '<p style="color:#888;padding:40px;font-family:Inter,sans-serif;">Error cargando datos.</p>';
    return;
  }

  // Carga inicial de Firestore en paralelo
  const hoy = new Date().toISOString().split('T')[0];
  const [progresoSnap, notasSnap, semanaSnap, accionesDoc] = await Promise.all([
    db.collection('progreso').get(),
    db.collection('notas_metas').get(),
    db.collection('semana').get(),
    db.collection('acciones_ia').doc(hoy).get(),
  ]);

  progresoSnap.forEach(doc => { progresoCache[doc.id] = doc.data(); });
  notasSnap.forEach(doc => { notasCache[doc.id] = doc.data().texto || ''; });
  semanaSnap.forEach(doc => { semanaEditsCache[doc.id] = doc.data(); });

  renderHeroDate();
  renderSemana();
  renderMetas();
  renderAcciones(accionesDoc.exists ? accionesDoc.data().acciones : []);
  renderProgreso();
  setupModalSelect();

  // Listener en tiempo real para avances (refleja lo que registre el bot de Telegram)
  db.collection('avances').orderBy('timestamp', 'desc').onSnapshot(snap => {
    avancesCache = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (!avancesCache[d.metaId]) avancesCache[d.metaId] = [];
      avancesCache[d.metaId].push({ id: doc.id, ...d });
    });
    // Actualizar secciones de avances visibles
    if (METAS_DATA) {
      METAS_DATA.metas.forEach(meta => {
        const el = document.getElementById(`avances-${meta.id}`);
        if (el) el.innerHTML = `<div class="meta-avances-label">Mis avances</div>${buildAvancesHTML(meta.id)}`;
      });
    }
  });
}

// === FECHA ===

function renderHeroDate() {
  const hoy = new Date();
  const fecha = `${DIAS_ES[hoy.getDay()]} ${hoy.getDate()} de ${MESES_ES[hoy.getMonth()]}, ${hoy.getFullYear()}`;
  document.getElementById('hero-date').textContent = fecha;
  document.getElementById('acciones-date').textContent = fecha;
}

// === SEMANA ===

function renderSemana() {
  const container = document.getElementById('semana-cards');
  METAS_DATA.semana.forEach((dia, diaIndex) => {
    const card = document.createElement('div');
    card.className = 'dia-card';
    const diaEdits = semanaEditsCache[`dia_${diaIndex}`] || {};

    const bloquesHTML = dia.bloques.map((b, bloqueIndex) => {
      const savedHora = diaEdits[`bloque_${bloqueIndex}_hora`] || b.hora;
      const savedActividad = diaEdits[`bloque_${bloqueIndex}_actividad`] || b.actividad;
      return `
        <div class="bloque">
          <span class="bloque-hora editable" contenteditable="true"
            data-dia="${diaIndex}" data-bloque="${bloqueIndex}" data-campo="hora"
            onblur="guardarBloque(this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
          >${savedHora}</span>
          <span class="bloque-actividad editable" contenteditable="true"
            data-dia="${diaIndex}" data-bloque="${bloqueIndex}" data-campo="actividad"
            onblur="guardarBloque(this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
          >${savedActividad}</span>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="dia-header" onclick="toggleCard(this)">
        <div class="dia-dot" style="background:${dia.color}"></div>
        <span class="dia-nombre">${dia.nombre}</span>
        <span class="dia-resumen">${dia.resumen}</span>
        <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="dia-body">
        <div class="dia-bloques">${bloquesHTML}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function guardarBloque(el) {
  const field = `bloque_${el.dataset.bloque}_${el.dataset.campo}`;
  db.collection('semana').doc(`dia_${el.dataset.dia}`).set(
    { [field]: el.textContent.trim() },
    { merge: true }
  );
}

// === METAS ===

function renderMetas() {
  const container = document.getElementById('metas-cards');

  METAS_DATA.metas.forEach(meta => {
    const savedNota = notasCache[meta.id] || meta.realidadHoy || '';

    const nivelesHTML = NIVEL_ORDEN.map((nivelKey, nivelIndex) => {
      const pasos = meta.niveles[nivelKey] || [];
      const color = NIVEL_COLORES[nivelKey];
      const label = NIVEL_LABELS[nivelKey];
      const progresoMeta = progresoCache[meta.id] || {};

      const pasosHTML = pasos.map((paso, pasoIndex) => {
        const completado = progresoMeta[`paso_${nivelIndex}_${pasoIndex}`] === true;
        return `
          <li class="paso-item${completado ? ' completado' : ''}">
            <input type="checkbox" class="paso-checkbox"
              ${completado ? 'checked' : ''}
              data-meta="${meta.id}" data-nivel="${nivelIndex}" data-paso="${pasoIndex}"
              onchange="togglePaso(this)" />
            <span class="paso-texto" onclick="this.previousElementSibling.click()">${paso}</span>
          </li>
        `;
      }).join('');

      return `
        <div class="nivel-item">
          <span class="nivel-badge" style="background:${color.bg};color:${color.text}">${label}</span>
          <ul class="nivel-pasos">${pasosHTML}</ul>
        </div>
      `;
    }).join('');

    const accionesLibresHTML = meta.accionesHoy.map(a => `
      <div class="accion-libre-item">
        <div class="accion-dot"></div>
        <span>${a}</span>
      </div>
    `).join('');

    const card = document.createElement('div');
    card.className = 'meta-card';
    card.dataset.metaId = meta.id;
    card.innerHTML = `
      <div class="meta-header" onclick="toggleCard(this)">
        <span class="meta-icon"><i data-lucide="${meta.icono}" width="18" height="18"></i></span>
        <div class="meta-info">
          <div class="meta-nombre">${meta.nombre}</div>
          <div class="meta-tagline">${meta.tagline}</div>
        </div>
        <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="meta-body">
        <div class="meta-body-inner">
          <div class="meta-descripcion">${meta.descripcion}</div>
          <div class="meta-hoy">
            <div class="meta-hoy-label">Dónde estoy hoy</div>
            <div class="meta-hoy-texto"
              contenteditable="true"
              data-placeholder="Escribe dónde estás parada hoy..."
              data-meta-id="${meta.id}">${savedNota}</div>
          </div>
          <div class="meta-niveles">${nivelesHTML}</div>
          <div class="meta-acciones-libres">
            <div class="meta-acciones-libres-label">Hoy — gratis — en 10 minutos</div>
            ${accionesLibresHTML}
          </div>
          <div class="meta-avances" id="avances-${meta.id}">
            <div class="meta-avances-label">Mis avances</div>
            ${buildAvancesHTML(meta.id)}
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();

  // Auto-guardar notas en Firestore con debounce
  document.querySelectorAll('.meta-hoy-texto').forEach(el => {
    let timer;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        db.collection('notas_metas').doc(el.dataset.metaId).set(
          { texto: el.textContent },
          { merge: true }
        );
      }, 800);
    });
  });
}

// === AVANCES ===

function buildAvancesHTML(metaId) {
  const avances = avancesCache[metaId] || [];
  if (avances.length === 0) return '<p class="avance-empty">Aún no hay avances registrados.</p>';
  return avances.map(a => `
    <div class="avance-item">
      <span class="avance-fecha">${a.fecha || ''}</span>
      <span class="avance-texto" id="avance-texto-${a.id}">${a.texto}</span>
      <div class="avance-btns">
        <button class="avance-btn" id="avance-edit-btn-${a.id}"
          onclick="editarAvance('${metaId}', '${a.id}')" title="Editar">✎</button>
        <button class="avance-btn avance-btn-del"
          onclick="borrarAvance('${a.id}')" title="Borrar">×</button>
      </div>
    </div>
  `).join('');
}

function editarAvance(metaId, avanceId) {
  const textoEl = document.getElementById(`avance-texto-${avanceId}`);
  const editBtn = document.getElementById(`avance-edit-btn-${avanceId}`);
  if (!textoEl) return;

  if (textoEl.contentEditable === 'true') {
    const nuevoTexto = textoEl.textContent.trim();
    db.collection('avances').doc(avanceId).update({ texto: nuevoTexto });
    textoEl.contentEditable = 'false';
    textoEl.classList.remove('editando');
    editBtn.textContent = '✎';
    showToast('Avance actualizado');
  } else {
    textoEl.contentEditable = 'true';
    textoEl.classList.add('editando');
    textoEl.focus();
    const range = document.createRange();
    range.selectNodeContents(textoEl);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    editBtn.textContent = '✓';
  }
}

function borrarAvance(avanceId) {
  db.collection('avances').doc(avanceId).delete();
  showToast('Avance eliminado');
}

// === ACCIONES DE HOY ===

function renderAcciones(accionesIA) {
  const container = document.getElementById('acciones-estaticas');

  METAS_DATA.metas.forEach(meta => {
    const group = document.createElement('div');
    group.className = 'acciones-meta-group';
    group.innerHTML = `
      <div class="acciones-meta-nombre">${meta.nombre}</div>
      ${meta.accionesHoy.slice(0, 3).map(a => `
        <div class="accion-estatica-item">
          <div class="accion-dot"></div>
          <span>${a}</span>
        </div>
      `).join('')}
    `;
    container.appendChild(group);
  });

  if (accionesIA && accionesIA.length > 0) renderIAacciones(accionesIA);
}

// === PROGRESO ===

function renderProgreso() {
  const container = document.getElementById('progreso-cards');
  METAS_DATA.metas.forEach(meta => {
    const { total, completados } = contarPasos(meta);
    const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
    const item = document.createElement('div');
    item.className = 'progreso-item';
    item.dataset.metaId = meta.id;
    item.innerHTML = `
      <div class="progreso-meta-nombre">${meta.nombre}</div>
      <div class="progreso-bar-wrap">
        <div class="progreso-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progreso-stats">${completados} de ${total} pasos completados</div>
    `;
    container.appendChild(item);
  });
}

function contarPasos(meta) {
  let total = 0, completados = 0;
  const progresoMeta = progresoCache[meta.id] || {};
  NIVEL_ORDEN.forEach((nivelKey, nivelIndex) => {
    (meta.niveles[nivelKey] || []).forEach((_, pasoIndex) => {
      total++;
      if (progresoMeta[`paso_${nivelIndex}_${pasoIndex}`] === true) completados++;
    });
  });
  return { total, completados };
}

// === HELPERS ===

function toggleCard(header) {
  header.parentElement.classList.toggle('open');
}

async function togglePaso(checkbox) {
  const { meta: metaId, nivel: nivelIndex, paso: pasoIndex } = checkbox.dataset;
  const field = `paso_${nivelIndex}_${pasoIndex}`;

  // Actualizar caché y UI de inmediato (optimistic)
  if (!progresoCache[metaId]) progresoCache[metaId] = {};
  progresoCache[metaId][field] = checkbox.checked;
  checkbox.parentElement.classList.toggle('completado', checkbox.checked);
  updateProgreso(metaId);

  // Guardar en Firestore
  await db.collection('progreso').doc(metaId).set(
    { [field]: checkbox.checked },
    { merge: true }
  );
}

function updateProgreso(metaId) {
  const meta = METAS_DATA.metas.find(m => m.id === metaId);
  if (!meta) return;
  const { total, completados } = contarPasos(meta);
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
  const item = document.querySelector(`#progreso-cards .progreso-item[data-meta-id="${metaId}"]`);
  if (item) {
    item.querySelector('.progreso-bar-fill').style.width = `${pct}%`;
    item.querySelector('.progreso-stats').textContent = `${completados} de ${total} pasos completados`;
  }
}

function setupModalSelect() {
  const select = document.getElementById('modal-meta-select');
  METAS_DATA.metas.forEach(meta => {
    const opt = document.createElement('option');
    opt.value = meta.id;
    opt.textContent = meta.nombre;
    select.appendChild(opt);
  });
}

function scrollToAcciones() {
  document.getElementById('acciones-hoy').scrollIntoView({ behavior: 'smooth' });
}

// === MODAL AVANCE ===

function openModal() {
  document.getElementById('modal-avance').classList.remove('hidden');
  document.getElementById('modal-texto').value = '';
}

function closeModal() {
  document.getElementById('modal-avance').classList.add('hidden');
}

async function guardarAvance() {
  const metaId = document.getElementById('modal-meta-select').value;
  const texto = document.getElementById('modal-texto').value.trim();
  if (!texto) return;

  const hoy = new Date();
  const fecha = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`;
  const hora = hoy.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  await db.collection('avances').add({
    metaId,
    texto,
    fecha: `${fecha} ${hora}`,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    tipo: 'avance',
    fuente: 'web',
  });

  closeModal();
  showToast('¡Avance registrado!');
}

function showToast(msg) {
  const toast = document.getElementById('app-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// === IA ===

async function triggerGenerateActions() {
  const apiKey = localStorage.getItem('claude_api_key');
  if (!apiKey) { openApiKeyModal(); return; }
  await generateActions();
}

async function generateActions() {
  document.getElementById('ia-loading').classList.remove('hidden');
  document.getElementById('ia-resultado').innerHTML = '';

  try {
    const progreso = METAS_DATA.metas.map(meta => {
      const { total, completados } = contarPasos(meta);
      return { nombre: meta.nombre, completados, total };
    });

    const resultado = await generateDailyActions(METAS_DATA.metas, progreso);

    if (resultado && resultado.length > 0) {
      const hoy = new Date().toISOString().split('T')[0];
      const saved = resultado.map(r => ({ ...r, completada: false }));
      await db.collection('acciones_ia').doc(hoy).set({ acciones: saved });
      renderIAacciones(saved);
    }
  } catch (e) {
    document.getElementById('ia-resultado').innerHTML =
      `<p style="color:var(--text-secondary);font-size:13px;padding:12px 0;">${e.message}</p>`;
  } finally {
    document.getElementById('ia-loading').classList.add('hidden');
  }
}

function renderIAacciones(acciones) {
  const container = document.getElementById('ia-resultado');
  container.innerHTML = acciones.map((a, i) => `
    <div class="ia-accion-card">
      <input type="checkbox" class="paso-checkbox"
        ${a.completada ? 'checked' : ''}
        onchange="toggleIAaccion(${i}, this)"
        style="flex-shrink:0;margin-top:3px" />
      <div>
        <div class="ia-meta-label">${a.meta}</div>
        <div class="ia-accion-texto">${a.accion}</div>
      </div>
    </div>
  `).join('');
}

async function toggleIAaccion(index, checkbox) {
  const hoy = new Date().toISOString().split('T')[0];
  const doc = await db.collection('acciones_ia').doc(hoy).get();
  const acciones = doc.data()?.acciones || [];
  if (acciones[index]) {
    acciones[index].completada = checkbox.checked;
    await db.collection('acciones_ia').doc(hoy).set({ acciones });
  }
}

function openApiKeyModal() {
  document.getElementById('modal-apikey').classList.remove('hidden');
  document.getElementById('apikey-input').value = localStorage.getItem('claude_api_key') || '';
}

function closeApiKeyModal() {
  document.getElementById('modal-apikey').classList.add('hidden');
}

function saveApiKey() {
  const key = document.getElementById('apikey-input').value.trim();
  if (!key) return;
  localStorage.setItem('claude_api_key', key);
  closeApiKeyModal();
  generateActions();
}

init();
