let METAS_DATA = null;

const NIVEL_ORDEN = ['10', '5', '2', '1', '6m'];

// Escala de grises para los niveles
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

async function init() {
  try {
    const res = await fetch('data/metas.json');
    METAS_DATA = await res.json();
  } catch (e) {
    document.body.innerHTML = '<p style="color:#888;padding:40px;font-family:Inter,sans-serif;">Error cargando datos. Corre la app con: <code>python3 -m http.server 8080</code></p>';
    return;
  }

  renderHeroDate();
  renderSemana();
  renderMetas();
  renderAcciones();
  renderProgreso();
  setupModalSelect();
}

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

    const bloquesHTML = dia.bloques.map((b, bloqueIndex) => {
      const savedHora = localStorage.getItem(`semana_${diaIndex}_${bloqueIndex}_hora`) || b.hora;
      const savedActividad = localStorage.getItem(`semana_${diaIndex}_${bloqueIndex}_actividad`) || b.actividad;
      return `
        <div class="bloque">
          <span class="bloque-hora editable"
            contenteditable="true"
            data-dia="${diaIndex}" data-bloque="${bloqueIndex}" data-campo="hora"
            onblur="guardarBloque(this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
          >${savedHora}</span>
          <span class="bloque-actividad editable"
            contenteditable="true"
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
  const key = `semana_${el.dataset.dia}_${el.dataset.bloque}_${el.dataset.campo}`;
  localStorage.setItem(key, el.textContent.trim());
}

// === METAS ===

function renderMetas() {
  const container = document.getElementById('metas-cards');

  METAS_DATA.metas.forEach(meta => {
    const savedNota = localStorage.getItem(`progreso_notas_${meta.id}`) || meta.realidadHoy || '';

    const nivelesHTML = NIVEL_ORDEN.map((nivelKey, nivelIndex) => {
      const pasos = meta.niveles[nivelKey] || [];
      const color = NIVEL_COLORES[nivelKey];
      const label = NIVEL_LABELS[nivelKey];

      const pasosHTML = pasos.map((paso, pasoIndex) => {
        const storageKey = `meta_${meta.id}_paso_${nivelIndex}_${pasoIndex}`;
        const completado = localStorage.getItem(storageKey) === 'true';
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

  document.querySelectorAll('.meta-hoy-texto').forEach(el => {
    el.addEventListener('input', () => {
      localStorage.setItem(`progreso_notas_${el.dataset.metaId}`, el.textContent);
    });
  });
}

// === AVANCES ===

function buildAvancesHTML(metaId) {
  const avances = JSON.parse(localStorage.getItem(`avances_${metaId}`) || '[]');
  if (avances.length === 0) {
    return '<p class="avance-empty">Aún no hay avances registrados.</p>';
  }
  return avances
    .map((a, i) => ({ ...a, idx: i }))
    .reverse()
    .map(a => `
      <div class="avance-item" id="avance-item-${metaId}-${a.idx}">
        <span class="avance-fecha">${a.fecha}</span>
        <span class="avance-texto" id="avance-texto-${metaId}-${a.idx}">${a.texto}</span>
        <div class="avance-btns">
          <button class="avance-btn" id="avance-edit-btn-${metaId}-${a.idx}"
            onclick="editarAvance('${metaId}', ${a.idx})" title="Editar">✎</button>
          <button class="avance-btn avance-btn-del"
            onclick="borrarAvance('${metaId}', ${a.idx})" title="Borrar">×</button>
        </div>
      </div>
    `).join('');
}

function editarAvance(metaId, index) {
  const textoEl = document.getElementById(`avance-texto-${metaId}-${index}`);
  const editBtn = document.getElementById(`avance-edit-btn-${metaId}-${index}`);

  if (textoEl.contentEditable === 'true') {
    // Guardar
    const avances = JSON.parse(localStorage.getItem(`avances_${metaId}`) || '[]');
    avances[index].texto = textoEl.textContent.trim();
    localStorage.setItem(`avances_${metaId}`, JSON.stringify(avances));
    textoEl.contentEditable = 'false';
    textoEl.classList.remove('editando');
    editBtn.textContent = '✎';
    showToast('Avance actualizado');
  } else {
    // Activar edición
    textoEl.contentEditable = 'true';
    textoEl.classList.add('editando');
    textoEl.focus();
    // Mover cursor al final
    const range = document.createRange();
    range.selectNodeContents(textoEl);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    editBtn.textContent = '✓';
  }
}

function borrarAvance(metaId, index) {
  const avances = JSON.parse(localStorage.getItem(`avances_${metaId}`) || '[]');
  avances.splice(index, 1);
  localStorage.setItem(`avances_${metaId}`, JSON.stringify(avances));

  const container = document.getElementById(`avances-${metaId}`);
  container.innerHTML = `
    <div class="meta-avances-label">Mis avances</div>
    ${buildAvancesHTML(metaId)}
  `;
  showToast('Avance eliminado');
}

// === ACCIONES DE HOY ===

function renderAcciones() {
  const container = document.getElementById('acciones-estaticas');

  METAS_DATA.metas.forEach(meta => {
    const acciones = meta.accionesHoy.slice(0, 3);
    const group = document.createElement('div');
    group.className = 'acciones-meta-group';
    group.innerHTML = `
      <div class="acciones-meta-nombre">${meta.nombre}</div>
      ${acciones.map(a => `
        <div class="accion-estatica-item">
          <div class="accion-dot"></div>
          <span>${a}</span>
        </div>
      `).join('')}
    `;
    container.appendChild(group);
  });

  const hoy = new Date().toISOString().split('T')[0];
  const savedIA = JSON.parse(localStorage.getItem(`ia_acciones_${hoy}`) || '[]');
  if (savedIA.length > 0) renderIAacciones(savedIA);
}

// === PROGRESO ===

function renderProgreso() {
  const container = document.getElementById('progreso-cards');

  METAS_DATA.metas.forEach(meta => {
    let total = 0;
    let completados = 0;

    NIVEL_ORDEN.forEach((nivelKey, nivelIndex) => {
      const pasos = meta.niveles[nivelKey] || [];
      pasos.forEach((_, pasoIndex) => {
        total++;
        if (localStorage.getItem(`meta_${meta.id}_paso_${nivelIndex}_${pasoIndex}`) === 'true') completados++;
      });
    });

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

// === HELPERS ===

function toggleCard(header) {
  header.parentElement.classList.toggle('open');
}

function togglePaso(checkbox) {
  const key = `meta_${checkbox.dataset.meta}_paso_${checkbox.dataset.nivel}_${checkbox.dataset.paso}`;
  localStorage.setItem(key, checkbox.checked);
  checkbox.parentElement.classList.toggle('completado', checkbox.checked);
  updateProgreso(checkbox.dataset.meta);
}

function updateProgreso(metaId) {
  const meta = METAS_DATA.metas.find(m => m.id === metaId);
  if (!meta) return;

  let total = 0;
  let completados = 0;

  NIVEL_ORDEN.forEach((nivelKey, nivelIndex) => {
    const pasos = meta.niveles[nivelKey] || [];
    pasos.forEach((_, pasoIndex) => {
      total++;
      if (localStorage.getItem(`meta_${meta.id}_paso_${nivelIndex}_${pasoIndex}`) === 'true') completados++;
    });
  });

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

function guardarAvance() {
  const metaId = document.getElementById('modal-meta-select').value;
  const texto = document.getElementById('modal-texto').value.trim();
  if (!texto) return;

  const hoy = new Date();
  const fecha = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`;
  const hora = hoy.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const avances = JSON.parse(localStorage.getItem(`avances_${metaId}`) || '[]');
  avances.push({ fecha: `${fecha} ${hora}`, texto });
  localStorage.setItem(`avances_${metaId}`, JSON.stringify(avances));

  const container = document.getElementById(`avances-${metaId}`);
  if (container) {
    container.innerHTML = `
      <div class="meta-avances-label">Mis avances</div>
      ${buildAvancesHTML(metaId)}
    `;
  }

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
  if (!apiKey) {
    openApiKeyModal();
    return;
  }
  await generateActions();
}

async function generateActions() {
  document.getElementById('ia-loading').classList.remove('hidden');
  document.getElementById('ia-resultado').innerHTML = '';

  try {
    const progreso = METAS_DATA.metas.map(meta => {
      let total = 0, completados = 0;
      NIVEL_ORDEN.forEach((nivelKey, nivelIndex) => {
        const pasos = meta.niveles[nivelKey] || [];
        pasos.forEach((_, pasoIndex) => {
          total++;
          if (localStorage.getItem(`meta_${meta.id}_paso_${nivelIndex}_${pasoIndex}`) === 'true') completados++;
        });
      });
      return { nombre: meta.nombre, completados, total };
    });

    const resultado = await generateDailyActions(METAS_DATA.metas, progreso);

    if (resultado && resultado.length > 0) {
      const hoy = new Date().toISOString().split('T')[0];
      const saved = resultado.map(r => ({ ...r, completada: false }));
      localStorage.setItem(`ia_acciones_${hoy}`, JSON.stringify(saved));
      renderIAacciones(saved);
    }
  } catch (e) {
    document.getElementById('ia-resultado').innerHTML = `
      <p style="color:var(--text-secondary);font-size:13px;padding:12px 0;">${e.message || 'Error al generar acciones. Verifica tu API key.'}</p>
    `;
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

function toggleIAaccion(index, checkbox) {
  const hoy = new Date().toISOString().split('T')[0];
  const acciones = JSON.parse(localStorage.getItem(`ia_acciones_${hoy}`) || '[]');
  if (acciones[index]) {
    acciones[index].completada = checkbox.checked;
    localStorage.setItem(`ia_acciones_${hoy}`, JSON.stringify(acciones));
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
