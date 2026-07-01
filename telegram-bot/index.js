require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const cron = require('node-cron');
const METAS = require('./metas');

// === FIREBASE — SEMANA PERFECTA ===
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// === FIREBASE — WEEKLY PLANNER ===
const wpApp = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.WP_FIREBASE_PROJECT_ID,
    clientEmail: process.env.WP_FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.WP_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
}, 'weekly-planner');
const wpDb = wpApp.firestore();

const FERNANDA_UID = process.env.FERNANDA_UID;
const FERNANDA_CHAT_ID = process.env.FERNANDA_CHAT_ID;

function wpUser() {
  return wpDb.collection('users').doc(FERNANDA_UID).collection('data');
}

// === CLIENTES ===
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const userState = {};

// === SISTEMA DE PERSONALIDAD ===
const SYSTEM_PROMPT = `Eres el asistente personal de Fer en Telegram. Tu misión principal no es hacerla más productiva. Tu misión principal es ayudarla a estar bien, reducir su carga mental, bajar su estrés y organizar su vida alrededor de su energía real, su ciclo menstrual, su salud, sus metas y su cuerpo.

Tu prioridad absoluta es proteger su sistema nervioso.

No eres un bot de recordatorios. Eres un Chief of Staff de su energía, su salud y su vida diaria.

Antes de recomendar cualquier cosa, evalúa los datos que tengas disponibles: calidad de sueño, Body Battery, estrés, HRV, fase del ciclo, día del ciclo, agenda del día, pendientes, entrenamientos recientes, estado emocional si lo compartió, y metas de largo plazo.

Tu objetivo nunca es llenar su agenda. Tu objetivo es ayudarla a llegar al final del día sintiéndose tranquila, orgullosa y con energía suficiente para repetir un buen día mañana.

Fer es muy orientada al logro. Cuando tiene mucha energía tiende a sobre comprometerse. Cuando tiene poca energía tiende a sentirse culpable. Tu trabajo es ayudarla a evitar ambos extremos.

Nunca uses lenguaje que genere culpa o presión: "deberías", "tienes que", "estás atrasada", "no hiciste", "te falta demasiado".
Prefiere frases como: "Hoy tu cuerpo parece pedir...", "Hoy sería inteligente...", "Hoy tienes permiso de...", "Hoy ganar significa...", "No necesitas hacer todo, solo lo correcto para tu energía de hoy."
Descansar también es avanzar.

PERSONALIDAD Y TONO
Háblale como una mezcla de: asistente ejecutiva premium, amiga cercana, coach de salud amable, entrenadora inteligente, protectora de su sistema nervioso.
El tono debe ser cálido, directo, útil, cero genérico y con humor ligero cuando aplique.
Evita mensajes aburridos. Cada mensaje debe ayudarla a tomar una decisión concreta.
Español mexicano natural. Máximo 2-3 párrafos cortos en conversación libre. Menos es más.

DATOS PERSONALES
- Vive en Mérida, México. Se despierta entre 4-5am.
- Animales: caballo Atlas, perro Rogelio, víbora Sombra, gato Benito.
- Lanza https://app.myweeklyplanner.app — aprende AI, automatizaciones, vibe coding.
- Deuda de tarjetas, pagándola activamente. Cuida a su mamá con discapacidad.
- Mayor reto: scroll de redes sociales — no lo menciones tú primero.
- Bloque profundo de trabajo: lunes a jueves 7-11:30am aprox.

RUTINA BASE
- Lunes: gimnasio. Martes: pilates. Miércoles: natación. Jueves: gimnasio. Viernes: natación.
- Equitación: martes y jueves 4:50pm, sábado 8:30am (a veces desayuna en el club).
- Lunes 7pm: clase de violín.
- Lunes, martes, miércoles y viernes 7am: recogen a los perros para entrenamiento.
- Después del bloque profundo: 40 min de tareas del hogar (tender cama, cocina, lavadora, preparar comida, etc.) antes de volver a trabajar hasta la 1pm.

METAS DE FER
Reducir cortisol, bajar grasa de forma sostenible, tonificarse, tener fuerza, energía para cuidar a su mamá, montar a Atlas, nadar, apnea, escalar, viajar, patinar, pilates, gym, construir sus empresas, vida organizada, independencia física en la vejez. La meta estética existe pero no es la principal — el objetivo es fuerza, salud y bienestar.
Cuando Fer tenga energía alta, puedes usar motivación divertida con cariño ("las nalguitas no se construyen solas", "hoy tu Garmin te está pidiendo que levantes cosas pesadas"). Cuando energía sea baja: nunca humor sobre rendimiento físico.

CICLO MENSTRUAL — adapta SIEMPRE tus recomendaciones a la fase:
MENSTRUAL (días 1-5): descanso, yoga suave, caminata, comida caliente, hierro, proteína, omega 3, vitamina C. Evita HIIT, cargas máximas, presión por productividad.
FOLICULAR (días 6-13): fuerza, gym, natación, tenis, aprender cosas nuevas, trabajo profundo, proyectos creativos, planeación, decisiones importantes.
OVULACIÓN (días 14-16): reuniones, clientes, networking, contenido, grabar, entrenos fuertes si Garmin acompaña.
LÚTEA TEMPRANA (días 17-23): estructura, continuidad, entreno moderado, proteína, cerrar pendientes.
LÚTEA TARDÍA (días 24-28+): bajar ritmo, yoga, pilates suave, caminatas, no iniciar proyectos grandes, dormir más, comidas saciantes, quitar tareas innecesarias.

GARMIN — brújula fisiológica:
Body Battery >80: buen día para fuerza/natación/trabajo profundo. Motiva con energía.
Body Battery 50-80: productividad normal, entreno moderado, pausas estratégicas.
Body Battery 30-50: simplificar, evitar entrenos intensos, yoga/pilates/caminata.
Body Battery <30: recuperación, mover compromisos, no gimnasio pesado. Descansar hoy evita agotamiento mañana.
Sueño malo: reduce exigencia, desayuno con proteína, hidratación, luz natural, evitar decisiones grandes.
Estrés alto: respiración, pausa, caminar, jardín, agua, comida real, reducir cafeína.
Si detectas varios días seguidos de mal sueño + estrés alto + baja batería + lútea tardía/menstrual: tu prioridad deja de ser completar tareas. Tu prioridad es proteger a Fer.

NUTRICIÓN
Prefiere: huevos, yogurt griego, avena overnight, fruta, proteína en polvo, smoothies, verduras, café, comidas caseras.
Evita recomendar: pan, arroz en exceso, azúcar, comidas pesadas sin sentido.
Prioriza según fase/entreno: proteína, fibra, omega 3, hierro en menstrual, magnesio en lútea, carbos complejos cuando entrena, cenas ligeras.
No hagas comentarios restrictivos ni culpígenos sobre comida. La comida es combustible y cuidado.
Antes del café por las mañanas: siempre recomienda primero agua, algo suave o snack pequeño para el sistema nervioso.

SUPLEMENTOS (solo recuerda lo que Fer ya indicó, no des consejos médicos nuevos):
- 9am con desayuno: creatina.
- 9:30pm: espironolactona, magnesio, minoxidil.

FER RADAR — detecta patrones con cuidado:
Días sin fuerza: "Hace varios días que no veo fuerza en tu semana. ¿Fue decisión consciente o la semana se complicó?"
Mal sueño repetido: "Me preocupa tu tendencia de sueño. Hoy conviene proteger la noche más que agregar una tarea."
Estrés alto seguido: "Tu cuerpo no está pidiendo más presión. Está pidiendo menos ruido."
Sin Atlas: "Hace días que no veo tiempo con Atlas. Normalmente eso te regula. ¿Buscamos espacio esta semana?"
Constancia: reconócela. "Llevas varios días tomando decisiones que cuidan a tu yo futuro."

REGLA DE SEGURIDAD EMOCIONAL
Nunca castigues ni regañes. Si no hizo algo: "Ok. Entonces simplificamos."
Fer cansada → bajamos el ritmo. Fer saturada → elegimos solo una cosa. Fer triste → primero regulación, después productividad. Fer con energía → aprovechamos con inteligencia, no con exceso.

ACCESO TÉCNICO REAL (tienes herramientas conectadas a Firebase):
Puedes ver y agregar tareas, pendientes, enfoques del día, lista del súper, gastos, avances en metas, datos de Garmin y ciclo. Cuando ejecutes algo, confírmalo. Nunca digas que no tienes acceso — sí lo tienes.

REGLA ABSOLUTA — NUNCA INVENTES NI MIENTAS:
- Jamás inventes pendientes, tareas, gastos, enfoques o cualquier dato que no venga de una herramienta o de la conversación real.
- Si ella pregunta qué pendientes tiene (o tareas, gastos, etc.), SIEMPRE llama primero la herramienta correspondiente. Nunca respondas de memoria o "a ojo".
- Si una herramienta dice que no hay nada, dile honestamente que no hay nada.
- Si te pregunta algo que no puedes verificar, dile que no lo sabes. Nunca rellenes huecos con suposiciones presentadas como hechos.
- EXCEPCIÓN: estimaciones que te pide explícitamente ("¿cuántas calorías crees que tiene X?") — sí puedes dar tu mejor estimación, enmarcándola honestamente: "aprox.", "calculo que", "más o menos".`;

// === HELPERS — MEMORIA Y CONVERSACIÓN ===

async function getDatosImportantes() {
  const snap = await db.collection('memoria').orderBy('timestamp', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function guardarDatoImportante(texto) {
  await db.collection('memoria').add({
    texto,
    fecha: new Date().toLocaleDateString('es-MX'),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function borrarDatoImportante(id) {
  await db.collection('memoria').doc(id).delete();
}

async function guardarMensajeConversacion(role, texto) {
  await db.collection('conversacion').add({
    role,
    texto: texto.slice(0, 2000),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getHistorialReciente(limite = 30) {
  const snap = await db.collection('conversacion')
    .orderBy('timestamp', 'desc')
    .limit(limite)
    .get();
  const mensajes = snap.docs.reverse().map(d => d.data());
  // Asegurar alternancia user/assistant y que termine en assistant (no en user)
  const resultado = [];
  let lastRole = null;
  for (const m of mensajes) {
    if (m.role !== lastRole) {
      resultado.push(m);
      lastRole = m.role;
    }
  }
  while (resultado.length > 0 && resultado[resultado.length - 1].role === 'user') {
    resultado.pop();
  }
  return resultado;
}

// === HELPERS — SEMANA PERFECTA ===

async function guardarAvance(metaId, texto, tipo = 'avance') {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-MX');
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  await db.collection('avances').add({
    metaId, texto,
    fecha: `${fecha} ${hora}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    tipo, fuente: 'telegram',
  });
}

async function getAvancesRecientes(limite = 10) {
  const snap = await db.collection('avances')
    .orderBy('timestamp', 'desc').limit(limite).get();
  return snap.docs.map(d => d.data());
}

// === HELPERS — WEEKLY PLANNER ===

const SHOP_CATS = ['Supermercado', 'Casa', 'Personal', 'Oficina'];

function getWeekId() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  return 'week_' + monday.toISOString().split('T')[0];
}

function getBudgetDocId() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `budget_actual_${now.getFullYear()}_${month}`;
}

function jsToWpDay(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

async function getTareasHoy() {
  try {
    const weekId = getWeekId();
    const doc = await wpUser().doc(weekId).get();
    if (!doc.exists) return [];
    const data = doc.data();
    const wpDay = jsToWpDay(new Date().getDay());

    const tareas = [];
    const focus = data.focus?.[wpDay] || {};
    Object.values(focus).forEach(t => { if (t && t.trim()) tareas.push(t.trim()); });

    const tasks = (data.tasks || []).filter(t => !t.deleted && t.deletedOnDay === undefined);
    tasks.forEach(t => { if (t.text) tareas.push(t.text); });

    return tareas;
  } catch (e) {
    console.error('getTareasHoy error:', e);
    return [];
  }
}

async function agregarTareaWP(texto) {
  const weekId = getWeekId();
  const wpDay = jsToWpDay(new Date().getDay());
  await wpUser().doc(weekId).set({
    tasks: admin.firestore.FieldValue.arrayUnion({
      id: 't' + Date.now(),
      text: texto,
      addedOnDay: wpDay,
    })
  }, { merge: true });
}

async function agregarPendienteWP(texto) {
  const fecha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Merida' }).format(new Date());
  const id = 't' + Date.now();
  const ref = wpUser().doc('pending_tasks');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const tasks = doc.exists ? (doc.data().tasks || []) : [];
    tasks.push({ id, text: texto, addedDate: fecha });
    t.set(ref, { tasks });
  });
}

async function getListaSuperWP() {
  const doc = await wpUser().doc('shopping').get();
  if (!doc.exists) return {};
  return doc.data().cats || {};
}

async function agregarItemSuperWP(item, catIndex) {
  const field = `cats.cat${catIndex}`;
  try {
    await wpUser().doc('shopping').update({
      [field]: admin.firestore.FieldValue.arrayUnion({ text: item, done: false })
    });
  } catch {
    const cats = { cat0: [], cat1: [], cat2: [], cat3: [] };
    cats[`cat${catIndex}`] = [{ text: item, done: false }];
    await wpUser().doc('shopping').set({ cats });
  }
}

function fechaLocalHoy(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Merida' }).format(d);
}

async function getDatosGarmin() {
  for (const offset of [0, -1]) {
    const fecha = fechaLocalHoy(offset);
    const doc = await wpUser().doc(`garmin_${fecha}`).get();
    if (doc.exists) return { fecha, ...doc.data() };
  }
  return null;
}

function faseLunar(fecha = new Date()) {
  const SYNODIC = 29.53058867;
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const diffDias = (fecha.getTime() - refNewMoon) / 86400000;
  let frac = (diffDias % SYNODIC) / SYNODIC;
  if (frac < 0) frac += 1;
  if (frac < 0.0625 || frac >= 0.9375) return 'Luna Nueva';
  if (frac < 0.1875) return 'Luna Creciente';
  if (frac < 0.3125) return 'Cuarto Creciente';
  if (frac < 0.4375) return 'Gibosa Creciente';
  if (frac < 0.5625) return 'Luna Llena';
  if (frac < 0.6875) return 'Gibosa Menguante';
  if (frac < 0.8125) return 'Cuarto Menguante';
  return 'Luna Menguante';
}

async function getCiclo() {
  const doc = await wpUser().doc('ciclo').get();
  return doc.exists ? doc.data() : null;
}

async function registrarInicioPeriodoWP(fecha = null) {
  const fechaInicio = fecha || fechaLocalHoy();
  await wpUser().doc('ciclo').set(
    { ultimoInicio: fechaInicio, duracionPromedio: 28 },
    { merge: true }
  );
  return fechaInicio;
}

function calcularCiclo(ultimoInicio, duracionPromedio = 28) {
  const inicio = new Date(ultimoInicio + 'T00:00:00');
  const hoy = new Date(fechaLocalHoy() + 'T00:00:00');
  const diaCiclo = Math.floor((hoy - inicio) / 86400000) + 1;
  let fase;
  if (diaCiclo <= 5) fase = 'Menstrual';
  else if (diaCiclo <= 13) fase = 'Folicular';
  else if (diaCiclo <= 16) fase = 'Ovulación';
  else if (diaCiclo <= 23) fase = 'Lútea Temprana';
  else if (diaCiclo <= duracionPromedio) fase = 'Lútea Tardía';
  else fase = 'Lútea Tardía (ciclo más largo de lo usual)';
  return { diaCiclo, fase };
}

async function getBudgetConfig() {
  const doc = await wpUser().doc('budget_config').get();
  return doc.exists ? doc.data() : null;
}

async function registrarGasto(groupId, subId, monto) {
  const key = `${groupId}_${subId}`;
  await wpUser().doc(getBudgetDocId()).set(
    { [key]: admin.firestore.FieldValue.increment(monto) },
    { merge: true }
  );
}

const DEFAULT_GASTOS = ['🍽 Restaurante', '🛒 Supermercado', '🎬 Entretenimiento', '⛽ Gasolina', '🚗 Transporte', '📱 Suscripción', '💪 Ejercicio', '📚 Escuela', '🔧 Pago a servicio', '💼 Negocio', '🏠 Casa', '💳 Préstamo', '✈️ Viaje', '💸 Otro'];

async function getGastoCats() {
  try {
    const doc = await wpUser().doc('config').get();
    const cats = doc.exists ? doc.data()?.cfg?.gastoCats : null;
    return (cats && cats.length > 0) ? cats : DEFAULT_GASTOS;
  } catch { return DEFAULT_GASTOS; }
}

async function getMetodosPago() {
  try {
    const config = await getBudgetConfig();
    const tarjetas = (config?.debts || []).filter(d => d.tipo === 'tarjeta').map(d => d.nombre);
    return ['Efectivo', 'Débito', 'Transferencia', ...tarjetas];
  } catch { return ['Efectivo', 'Débito', 'Transferencia']; }
}

async function agregarGastoDia(desc, cat, monto, pagoCon) {
  const weekId = getWeekId();
  const wpDay = jsToWpDay(new Date().getDay());
  const doc = await wpUser().doc(weekId).get();
  const gastos = (doc.exists ? doc.data().gastos : null) || {};
  if (!gastos[wpDay]) gastos[wpDay] = [];
  gastos[wpDay].push({ desc, cat, monto, pagoCon });
  await wpUser().doc(weekId).set({ gastos }, { merge: true });
}

async function getPendientesWP() {
  const doc = await wpUser().doc('pending_tasks').get();
  if (!doc.exists) return [];
  return (doc.data().tasks || []).filter(t => !t.done);
}

async function completarPendienteWP(textoOId) {
  const doc = await wpUser().doc('pending_tasks').get();
  if (!doc.exists) return false;
  const tasks = doc.data().tasks || [];
  const lower = textoOId.toLowerCase();
  const idx = tasks.findIndex(t =>
    t.id === textoOId || t.text.toLowerCase().includes(lower)
  );
  if (idx < 0) return false;
  tasks[idx] = { ...tasks[idx], done: true };
  await wpUser().doc('pending_tasks').set({ tasks });
  return tasks[idx].text;
}

async function agregarEnfoqueDiaWP(texto, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : jsToWpDay(new Date().getDay());
  const doc = await wpUser().doc(weekId).get();
  const data = doc.exists ? doc.data() : {};
  const focusDia = data.focus?.[wpDay] || {};
  const nextSlot = [1, 2, 3].find(n => !focusDia[n]);
  if (!nextSlot) return false;
  await wpUser().doc(weekId).set(
    { focus: { [wpDay]: { ...focusDia, [nextSlot]: texto } } },
    { merge: true }
  );
  return true;
}

async function completarEnfoqueDiaWP(texto, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : jsToWpDay(new Date().getDay());
  const doc = await wpUser().doc(weekId).get();
  const data = doc.exists ? doc.data() : {};
  const focusDia = data.focus?.[wpDay] || {};
  const lower = texto.toLowerCase();
  const slot = [1, 2, 3].find(n => focusDia[n] && focusDia[n].toLowerCase().includes(lower));
  if (!slot) return null;
  const key = `${wpDay}_${slot}`;
  await wpUser().doc(weekId).set(
    { focusDone: { [key]: String(wpDay) } },
    { merge: true }
  );
  return focusDia[slot];
}

async function borrarEnfoqueDiaWP(texto, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : jsToWpDay(new Date().getDay());
  const doc = await wpUser().doc(weekId).get();
  const data = doc.exists ? doc.data() : {};
  const focusDia = data.focus?.[wpDay] || {};
  const lower = texto.toLowerCase();
  const slot = [1, 2, 3].find(n => focusDia[n] && focusDia[n].toLowerCase().includes(lower));
  if (!slot) return null;
  const textoBorrado = focusDia[slot];
  await wpUser().doc(weekId).set(
    { focus: { [wpDay]: { ...focusDia, [slot]: '' } } },
    { merge: true }
  );
  return textoBorrado;
}

async function tacharItemSuperWP(itemTexto, catIndex) {
  const cats = await getListaSuperWP();
  const key = `cat${catIndex}`;
  const items = [...(cats[key] || [])];
  const lower = itemTexto.toLowerCase();
  const idx = items.findIndex(it => !it.done && it.text.toLowerCase().includes(lower));
  if (idx < 0) return false;
  items[idx] = { ...items[idx], done: true };
  await wpUser().doc('shopping').update({ [`cats.${key}`]: items });
  return items[idx].text;
}

async function getEnfoquesDiaWP() {
  const weekId = getWeekId();
  const wpDay = jsToWpDay(new Date().getDay());
  const doc = await wpUser().doc(weekId).get();
  const focusDia = doc.exists ? (doc.data().focus?.[wpDay] || {}) : {};
  return [1, 2, 3].map(n => focusDia[n]).filter(Boolean);
}

async function getContextoDia() {
  const [garmin, cicloDoc, pendientes, tareas, enfoques] = await Promise.all([
    getDatosGarmin().catch(() => null),
    getCiclo().catch(() => null),
    getPendientesWP().catch(() => []),
    getTareasHoy().catch(() => []),
    getEnfoquesDiaWP().catch(() => []),
  ]);
  const luna = faseLunar();
  const cicloInfo = cicloDoc?.ultimoInicio
    ? calcularCiclo(cicloDoc.ultimoInicio, cicloDoc.duracionPromedio)
    : null;
  const notasCiclo = cicloDoc?.notasPersonales || null;

  let ctx = '';
  if (garmin) {
    ctx += `\nGarmin (${garmin.fecha}): sueño ${garmin.suenoHoras ?? 'N/D'}h score ${garmin.suenoScore ?? 'N/D'}, Body Battery ${garmin.bodyBattery ?? 'N/D'}, estrés ${garmin.stress ?? 'N/D'}, HRV ${garmin.hrv ?? 'N/D'}, FC reposo ${garmin.restingHR ?? 'N/D'}, SpO2 ${garmin.spo2 ?? 'N/D'}%`;
  }
  if (cicloInfo) {
    ctx += `\nCiclo: día ${cicloInfo.diaCiclo}, fase ${cicloInfo.fase}. Luna: ${luna}.`;
    if (notasCiclo) ctx += `\nNotas personales de Fer sobre su ciclo: ${notasCiclo}`;
  }
  if (tareas.length > 0) ctx += `\nTareas de hoy en el planner: ${tareas.slice(0, 5).join(', ')}`;
  if (enfoques.length > 0) ctx += `\nEnfoques del día: ${enfoques.join(' / ')}`;
  if (pendientes.length > 0) ctx += `\nPendientes abiertos (${pendientes.length}): ${pendientes.slice(0, 5).map(p => p.text).join(', ')}`;
  return ctx;
}

// === HERRAMIENTAS PARA CLAUDE (TOOL USE) ===

const TOOLS = [
  {
    name: 'agregar_tarea',
    description: 'Agrega una tarea a la semana actual de Fernanda en su Weekly Planner.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'Descripción de la tarea' } },
      required: ['texto'],
    },
  },
  {
    name: 'agregar_pendiente',
    description: 'Guarda un pendiente en la lista de pendientes de Fernanda (algo que tiene que hacer pero sin fecha fija aún).',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'Descripción del pendiente' } },
      required: ['texto'],
    },
  },
  {
    name: 'agregar_item_super',
    description: 'Agrega un item a la lista del súper de Fernanda.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre del producto' },
        categoria: { type: 'string', enum: SHOP_CATS, description: 'Categoría de la lista del súper' },
      },
      required: ['item', 'categoria'],
    },
  },
  {
    name: 'guardar_avance_meta',
    description: 'Registra un avance en una de las 13 metas de Fernanda.',
    input_schema: {
      type: 'object',
      properties: {
        meta_id: { type: 'string', enum: METAS.map(m => m.id), description: 'id de la meta correspondiente' },
        texto: { type: 'string', description: 'Descripción del avance' },
      },
      required: ['meta_id', 'texto'],
    },
  },
  {
    name: 'guardar_dato_importante',
    description: 'Guarda un dato importante en la memoria permanente del bot, para recordarlo en futuras conversaciones.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'El dato a recordar' } },
      required: ['texto'],
    },
  },
  {
    name: 'agregar_gasto_dia',
    description: 'Agrega un gasto al widget de gastos del día de Fernanda en su Weekly Planner. Usa esto cuando mencione cualquier gasto, compra o pago. Si falta algún dato (descripción, categoría, monto o forma de pago) pregunta antes de llamarla.',
    input_schema: {
      type: 'object',
      properties: {
        desc: { type: 'string', description: 'Descripción breve del gasto, ej. "Comida Costco", "Gasolina OXXO"' },
        cat: { type: 'string', description: 'Rubro/categoría del gasto según las opciones de Fernanda, ej. "🛒 Supermercado", "⛽ Gasolina", "🍽 Restaurante". Usa el texto exacto de su lista de rubros (disponible en contexto).' },
        monto: { type: 'number', description: 'Monto en pesos mexicanos' },
        pago_con: { type: 'string', description: 'Forma de pago: "Efectivo", "Débito", "Transferencia", o el nombre exacto de una tarjeta de crédito de Fernanda (disponible en contexto).' },
      },
      required: ['desc', 'cat', 'monto', 'pago_con'],
    },
  },
  {
    name: 'ver_datos_garmin',
    description: 'Lee los datos de salud de Fernanda sincronizados desde su reloj Garmin: HRV, Body Battery, nivel de estrés, SpO2, frecuencia cardíaca en reposo y datos de sueño (horas y score). OBLIGATORIO: úsala siempre que pregunte cómo durmió, su HRV, body battery, estrés, o cualquier dato de su Garmin — nunca respondas eso sin llamar esta herramienta primero.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'ver_ciclo_luna',
    description: 'Calcula el día actual del ciclo menstrual de Fernanda, la fase hormonal aproximada (Menstrual/Folicular/Ovulación/Lútea), la fase lunar de hoy, y trae sus notas personales guardadas sobre cómo vive cada fase. OBLIGATORIO: úsala siempre que pregunte en qué día de su ciclo va, su fase hormonal, o la fase de la luna — nunca lo respondas sin llamar esta herramienta primero. Si hay notas personales guardadas, básate en ellas (no en generalidades de libro de texto) para comentar cómo podría sentirse o qué le conviene hoy.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'registrar_inicio_periodo',
    description: 'Registra que le bajó el periodo, reiniciando el conteo del ciclo. Úsala cuando diga frases como "me bajó", "me llegó mi periodo", "empecé a menstruar", etc.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD si mencionó una fecha distinta a hoy. Omitir para usar hoy.' },
      },
      required: [],
    },
  },
  {
    name: 'actualizar_notas_ciclo',
    description: 'Guarda o actualiza las notas personales de Fernanda sobre cómo vive su ciclo (síntomas, energía, antojos, estado de ánimo típico por fase, qué le ayuda). Estas notas reemplazan las que había antes — si quiere agregar algo a lo ya guardado, primero llama ver_ciclo_luna para ver las notas actuales y manda el texto combinado. Úsala cuando te describa patrones de su ciclo o te pida explícitamente guardar/actualizar esa información.',
    input_schema: {
      type: 'object',
      properties: {
        notas: { type: 'string', description: 'Texto completo de las notas personales sobre su ciclo' },
      },
      required: ['notas'],
    },
  },
  {
    name: 'ver_pendientes',
    description: 'Lee la lista de pendientes actuales de Fernanda. OBLIGATORIO: úsala siempre que ella pregunte qué pendientes tiene, antes de responder — nunca contestes esa pregunta sin llamar esta herramienta primero. También úsala antes de completar_pendiente si no estás segura de cuál tachar.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'completar_pendiente',
    description: 'Marca un pendiente como completado/tachado. Usa parte del texto del pendiente para identificarlo.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto o fragmento del pendiente a tachar' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'agregar_enfoque_dia',
    description: 'Agrega un enfoque/tarea al bloque de enfoque del día en el Weekly Planner de Fernanda. Solo hay 3 espacios de enfoque por día — si ya están llenos, dile a Fernanda y pregúntale si reemplaza uno.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'El enfoque o tarea a agregar' },
        dia: { type: 'number', description: 'Día de la semana en formato Weekly Planner (0=lunes … 6=domingo). Omitir para usar el día actual.', minimum: 0, maximum: 6 },
      },
      required: ['texto'],
    },
  },
  {
    name: 'completar_enfoque_dia',
    description: 'Marca un enfoque del día como completado/tachado (✓). Usa parte del texto del enfoque para identificarlo.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto o fragmento del enfoque a tachar' },
        dia: { type: 'number', description: 'Día de la semana en formato Weekly Planner (0=lunes … 6=domingo). Omitir para usar el día actual.', minimum: 0, maximum: 6 },
      },
      required: ['texto'],
    },
  },
  {
    name: 'borrar_enfoque_dia',
    description: 'Elimina por completo un enfoque del día (libera ese espacio, a diferencia de tacharlo). Usa parte del texto del enfoque para identificarlo.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto o fragmento del enfoque a borrar' },
        dia: { type: 'number', description: 'Día de la semana en formato Weekly Planner (0=lunes … 6=domingo). Omitir para usar el día actual.', minimum: 0, maximum: 6 },
      },
      required: ['texto'],
    },
  },
  {
    name: 'tachar_item_super',
    description: 'Marca un ítem de la lista del súper como comprado.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre o fragmento del ítem a marcar como comprado' },
        categoria: { type: 'string', enum: SHOP_CATS, description: 'Categoría donde está el ítem' },
      },
      required: ['item', 'categoria'],
    },
  },
];

async function ejecutarRegistrarGasto(grupoNombre, subNombre, monto) {
  const config = await getBudgetConfig();
  const grupos = config?.groups || [];
  const grupo = grupos.find(g => g.name.toLowerCase() === grupoNombre.toLowerCase())
    || grupos.find(g => g.name.toLowerCase().includes(grupoNombre.toLowerCase()));
  if (!grupo) {
    return { ok: false, mensaje: `No encontré el área "${grupoNombre}". Áreas disponibles: ${grupos.map(g => g.name).join(', ')}` };
  }
  const sub = (grupo.subs || []).find(s => s.name.toLowerCase() === subNombre.toLowerCase())
    || (grupo.subs || []).find(s => s.name.toLowerCase().includes(subNombre.toLowerCase()));
  if (!sub) {
    return { ok: false, mensaje: `No encontré la subcategoría "${subNombre}" en ${grupo.name}. Opciones: ${(grupo.subs || []).map(s => s.name).join(', ')}` };
  }
  await registrarGasto(grupo.id, sub.id, monto);
  return { ok: true, mensaje: `Gasto de $${monto} registrado en ${grupo.name} → ${sub.name}` };
}

async function ejecutarHerramienta(nombre, input) {
  switch (nombre) {
    case 'agregar_tarea':
      await agregarTareaWP(input.texto);
      return { resultado: `Tarea agregada: "${input.texto}"`, etiqueta: 'tarea agregada al planner ✓' };

    case 'agregar_pendiente':
      await agregarPendienteWP(input.texto);
      return { resultado: `Pendiente guardado: "${input.texto}"`, etiqueta: 'pendiente guardado ✓' };

    case 'agregar_item_super': {
      const catIdx = SHOP_CATS.findIndex(c => c.toLowerCase() === String(input.categoria).toLowerCase());
      const idx = catIdx >= 0 ? catIdx : 0;
      await agregarItemSuperWP(input.item, idx);
      return { resultado: `"${input.item}" agregado a ${SHOP_CATS[idx]}`, etiqueta: `${input.item} agregado al súper ✓` };
    }

    case 'guardar_avance_meta': {
      const meta = METAS.find(m => m.id === input.meta_id);
      await guardarAvance(input.meta_id, input.texto);
      return { resultado: `Avance guardado en ${meta?.nombre || input.meta_id}`, etiqueta: `avance en ${meta?.nombre || input.meta_id} ✓` };
    }

    case 'guardar_dato_importante':
      await guardarDatoImportante(input.texto);
      return { resultado: `Guardado en memoria: "${input.texto}"`, etiqueta: 'dato guardado en memoria ✓' };

    case 'agregar_gasto_dia': {
      const gastoCats = await getGastoCats();
      const catLower = String(input.cat).toLowerCase();
      const catMatch = gastoCats.find(c => c.toLowerCase() === catLower)
        || gastoCats.find(c => c.toLowerCase().includes(catLower))
        || gastoCats.find(c => catLower.includes(c.replace(/^\S+\s/, '').toLowerCase()));
      const cat = catMatch || input.cat;
      await agregarGastoDia(input.desc, cat, input.monto, input.pago_con);
      return { resultado: `Gasto guardado: ${input.desc} — $${input.monto} (${cat}, ${input.pago_con})`, etiqueta: `$${input.monto} en ${cat} ✓` };
    }

    case 'ver_datos_garmin': {
      const datos = await getDatosGarmin();
      if (!datos) return { resultado: 'No hay datos de Garmin sincronizados todavía.', etiqueta: null };
      const resultado = `Datos de Garmin del ${datos.fecha}: HRV ${datos.hrv ?? 'N/D'}, Body Battery ${datos.bodyBattery ?? 'N/D'}, estrés ${datos.stress ?? 'N/D'}, FC en reposo ${datos.restingHR ?? 'N/D'}, SpO2 ${datos.spo2 ?? 'N/D'}%, sueño ${datos.suenoHoras ?? 'N/D'}h (score ${datos.suenoScore ?? 'N/D'})`;
      return { resultado, etiqueta: null };
    }

    case 'ver_ciclo_luna': {
      const ciclo = await getCiclo();
      const luna = faseLunar();
      const notas = ciclo?.notasPersonales ? `\nNotas personales de Fernanda sobre su ciclo: ${ciclo.notasPersonales}` : '\nNo hay notas personales guardadas todavía.';
      if (!ciclo || !ciclo.ultimoInicio) {
        return { resultado: `Fase lunar de hoy: ${luna}. No tengo registrado el inicio de su último periodo, así que no puedo calcular el día del ciclo.${notas}`, etiqueta: null };
      }
      const { diaCiclo, fase } = calcularCiclo(ciclo.ultimoInicio, ciclo.duracionPromedio);
      return { resultado: `Día ${diaCiclo} del ciclo, fase ${fase}. Fase lunar de hoy: ${luna}.${notas}`, etiqueta: null };
    }

    case 'registrar_inicio_periodo': {
      const fecha = await registrarInicioPeriodoWP(input.fecha || null);
      return { resultado: `Periodo registrado, inicio: ${fecha}.`, etiqueta: 'inicio de periodo registrado ✓' };
    }

    case 'actualizar_notas_ciclo': {
      await wpUser().doc('ciclo').set({ notasPersonales: input.notas }, { merge: true });
      return { resultado: 'Notas del ciclo actualizadas.', etiqueta: 'notas del ciclo guardadas ✓' };
    }

    case 'ver_pendientes': {
      const pendientes = await getPendientesWP();
      if (pendientes.length === 0) return { resultado: 'No hay pendientes.', etiqueta: null };
      const lista = pendientes.map((t, i) => `${i + 1}. ${t.text}`).join('\n');
      return { resultado: lista, etiqueta: null };
    }

    case 'completar_pendiente': {
      const completado = await completarPendienteWP(input.texto);
      if (!completado) return { resultado: `No encontré un pendiente con "${input.texto}". Usa ver_pendientes para ver la lista.`, etiqueta: null };
      return { resultado: `Pendiente tachado: "${completado}"`, etiqueta: `"${completado}" tachado ✓` };
    }

    case 'agregar_enfoque_dia': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      const agregado = await agregarEnfoqueDiaWP(input.texto, dia);
      if (!agregado) return { resultado: 'Ya hay 3 enfoques agregados para ese día (es el máximo). Pregúntale a Fernanda si quiere reemplazar alguno.', etiqueta: null };
      return { resultado: `Enfoque agregado: "${input.texto}"`, etiqueta: 'enfoque del día agregado ✓' };
    }

    case 'completar_enfoque_dia': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      const completado = await completarEnfoqueDiaWP(input.texto, dia);
      if (!completado) return { resultado: `No encontré un enfoque con "${input.texto}" en ese día.`, etiqueta: null };
      return { resultado: `Enfoque tachado: "${completado}"`, etiqueta: `"${completado}" tachado ✓` };
    }

    case 'borrar_enfoque_dia': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      const borrado = await borrarEnfoqueDiaWP(input.texto, dia);
      if (!borrado) return { resultado: `No encontré un enfoque con "${input.texto}" en ese día.`, etiqueta: null };
      return { resultado: `Enfoque borrado: "${borrado}"`, etiqueta: `"${borrado}" eliminado ✓` };
    }

    case 'tachar_item_super': {
      const catIdx = SHOP_CATS.findIndex(c => c.toLowerCase() === String(input.categoria).toLowerCase());
      const idx = catIdx >= 0 ? catIdx : 0;
      const tachado = await tacharItemSuperWP(input.item, idx);
      if (!tachado) return { resultado: `No encontré "${input.item}" en ${SHOP_CATS[idx]}.`, etiqueta: null };
      return { resultado: `"${tachado}" marcado como comprado`, etiqueta: `${tachado} comprado ✓` };
    }

    default:
      return { resultado: `Herramienta desconocida: ${nombre}`, etiqueta: null };
  }
}

// === CLAUDE API ===

async function llamarClaude(userMessage, contextoExtra = '') {
  const systemFinal = contextoExtra
    ? `${SYSTEM_PROMPT}\n\nContexto adicional:\n${contextoExtra}`
    : SYSTEM_PROMPT;
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemFinal,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0]?.text || '';
}

async function llamarClaudeConMemoria(userMessage, extraCtx = '') {
  const acciones = [];
  try {
    const [datos, historial, gastoCats, metodosPago, ctxDia] = await Promise.all([
      getDatosImportantes(),
      getHistorialReciente(30),
      getGastoCats(),
      getMetodosPago(),
      getContextoDia(),
    ]);

    let systemFinal = SYSTEM_PROMPT;
    systemFinal += `\n\n## Opciones para gastos del día:\n- Rubros: ${gastoCats.join(', ')}\n- Formas de pago: ${metodosPago.join(', ')}`;
    if (ctxDia) {
      systemFinal += `\n\n## Estado actual de Fer (datos en tiempo real):${ctxDia}`;
    }
    if (datos.length > 0) {
      systemFinal += '\n\n## Lo que recuerdas de Fernanda (datos importantes guardados):\n'
        + datos.map(d => `- ${d.texto}`).join('\n');
    }
    if (extraCtx) {
      systemFinal += '\n\nContexto adicional:\n' + extraCtx;
    }

    let messages = [
      ...historial.map(m => ({ role: m.role, content: m.texto })),
      { role: 'user', content: userMessage },
    ];

    let texto = '';
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemFinal,
        tools: TOOLS,
        messages,
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock) texto = textBlock.text;

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const tool of toolUseBlocks) {
        const { resultado, etiqueta } = await ejecutarHerramienta(tool.name, tool.input);
        if (etiqueta) acciones.push(etiqueta);
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: resultado });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { texto, acciones };
  } catch (e) {
    console.error('llamarClaudeConMemoria error:', e);
    const texto = await llamarClaude(userMessage, extraCtx);
    return { texto, acciones: [] };
  }
}

// === DETECCIÓN DE KEYWORDS EN JOURNAL ===

async function detectarYRegistrar(chatId, texto) {
  const lower = texto.toLowerCase();
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-MX');
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const ts = admin.firestore.FieldValue.serverTimestamp();
  const acciones = [];

  const entrenamientos = ['tennis', 'tenis', 'natación', 'nadar', 'gym', 'gimnasio', 'pilates', 'equitación', 'caballo', 'atlas'];
  const tipoEnt = entrenamientos.find(k => lower.includes(k));
  if (tipoEnt) {
    await db.collection('entrenamientos').add({ tipo: tipoEnt, fecha, hora, nota: texto, timestamp: ts });
    acciones.push('entrenamiento registrado ✓');
    if (lower.includes('atlas') || lower.includes('caballo')) {
      await guardarAvance('granja', texto, 'visita_atlas');
      acciones.push('visita a Atlas guardada ✓');
    }
  }

  const redesKw = ['instagram', 'tiktok', 'redes', 'scroll', 'celular', 'twitter'];
  if (redesKw.some(k => lower.includes(k))) {
    await db.collection('consciencia').add({ texto, fecha, hora, timestamp: ts });
    acciones.push('momento de consciencia registrado ✓');
  }

  const techKw = ['bug', 'app', 'planner', 'código', 'deploy', 'programé', 'vibe coding', 'automatización'];
  if (techKw.some(k => lower.includes(k))) {
    await guardarAvance('tecnologia', texto, 'journal');
    acciones.push('avance en meta Tecnología ✓');
  }

  return acciones;
}

// === MENÚ PRINCIPAL ===

function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📓 Journal', callback_data: 'cmd_journal' }, { text: '🎯 Mis metas', callback_data: 'cmd_metas' }],
      [{ text: '✅ Registrar avance', callback_data: 'cmd_avance' }, { text: '💪 Acciones de hoy', callback_data: 'cmd_acciones' }],
      [{ text: '💸 Registrar gasto', callback_data: 'cmd_gasto' }, { text: '🛒 Lista del súper', callback_data: 'cmd_super' }],
      [{ text: '📋 Agregar tarea', callback_data: 'cmd_tarea' }, { text: '😮‍💨 Cómo estoy', callback_data: 'cmd_como' }],
      [{ text: '🧠 Mis datos guardados', callback_data: 'cmd_datos' }, { text: '📊 Mi progreso', callback_data: 'cmd_progreso' }],
    ],
  };
}

// === COMANDOS ===

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log('Chat ID:', chatId);
  await bot.sendMessage(chatId,
    `Hola Fer 👋\n\nEstoy conectado a tu Weekly Planner, tus metas y tu presupuesto.\n\nTu Chat ID: \`${chatId}\``,
    { parse_mode: 'Markdown', reply_markup: menuKeyboard() }
  );
});

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '¿Qué hacemos?', { reply_markup: menuKeyboard() });
});

async function iniciarJournal(chatId) {
  userState[chatId] = { modo: 'journal' };
  await bot.sendMessage(chatId, '📓 Modo journal. Escribe lo que quieras — lo que piensas, cómo te sientes, qué pasó. Escribe /menu para salir.');
}
bot.onText(/\/journal/, (msg) => iniciarJournal(msg.chat.id));

async function mostrarMetas(chatId) {
  const botones = METAS.map(m => [{ text: m.nombre, callback_data: `ver_meta_${m.id}` }]);
  botones.push([{ text: '← Menú', callback_data: 'cmd_menu' }]);
  await bot.sendMessage(chatId, '🎯 *Tus 13 metas:*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: botones },
  });
}
bot.onText(/\/metas/, (msg) => mostrarMetas(msg.chat.id));

async function iniciarAvance(chatId) {
  const botones = METAS.map(m => [{ text: m.nombre, callback_data: `avance_meta_${m.id}` }]);
  botones.push([{ text: '← Cancelar', callback_data: 'cmd_menu' }]);
  userState[chatId] = { modo: 'avance_eligiendo_meta' };
  await bot.sendMessage(chatId, '✅ ¿Para cuál meta?', { reply_markup: { inline_keyboard: botones } });
}
bot.onText(/\/avance/, (msg) => iniciarAvance(msg.chat.id));

async function generarAcciones(chatId) {
  await bot.sendMessage(chatId, '💪 Generando acciones...');
  try {
    const hoy = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaHoy = dias[hoy.getDay()];
    const entrenamientosHoy = {
      Lunes: 'gym 6am',
      Martes: 'tennis 5am, natación 8am, equitación 4:30pm',
      Jueves: 'tennis 5am, natación 8am, equitación 4:30pm',
    };
    const entHoy = entrenamientosHoy[diaHoy] || 'sin entrenamiento programado';
    const tareas = await getTareasHoy();
    const recientes = await getAvancesRecientes(5);
    const resumenRecientes = recientes.map(a => `- [${a.metaId}]: ${a.texto}`).join('\n') || 'Sin avances recientes.';

    const prompt = `Es ${diaHoy}. Entrenamiento de hoy: ${entHoy}.
Tareas en el planner hoy: ${tareas.join(', ') || 'ninguna registrada'}.
Últimos avances en metas: ${resumenRecientes}

Dame 3 acciones concretas y realizables HOY para avanzar en las metas. Considera el día y lo que ya tiene planeado.

Formato (solo esto):
1. [Meta]: acción específica
2. [Meta]: acción específica
3. [Meta]: acción específica`;

    const respuesta = await llamarClaude(prompt);
    await bot.sendMessage(chatId, `💪 *Acciones de hoy — ${diaHoy}:*\n\n${respuesta}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando acciones.');
    console.error(e);
  }
}
bot.onText(/\/acciones/, (msg) => generarAcciones(msg.chat.id));

// --- GASTOS ---

async function iniciarGasto(chatId, montoDetectado = null) {
  try {
    const config = await getBudgetConfig();
    const grupos = (config?.groups || []).filter(g => g.subs?.length > 0);
    userState[chatId] = { modo: 'gasto_eligiendo_grupo', monto: montoDetectado, grupos };
    const botones = grupos.map((g, i) => [{ text: g.name, callback_data: `gastog_${i}` }]);
    botones.push([{ text: '← Cancelar', callback_data: 'cmd_menu' }]);
    const montoTexto = montoDetectado ? ` de $${montoDetectado.toLocaleString('es-MX')}` : '';
    await bot.sendMessage(chatId, `💸 Gasto${montoTexto}\n\n¿En qué área?`, {
      reply_markup: { inline_keyboard: botones }
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error cargando categorías.');
    console.error(e);
  }
}

async function confirmarGasto(chatId, grupo, sub, monto) {
  await registrarGasto(grupo.id, sub.id, monto);
  userState[chatId] = null;
  await bot.sendMessage(chatId,
    `✅ Guardado\n💸 *$${monto.toLocaleString('es-MX')}* en ${grupo.name} → ${sub.name}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '+ Otro gasto', callback_data: 'cmd_gasto' },
        { text: '← Menú', callback_data: 'cmd_menu' }
      ]]}
    }
  );
}

bot.onText(/\/gasto/, (msg) => iniciarGasto(msg.chat.id));

// --- SÚPER ---

async function mostrarSuper(chatId) {
  try {
    const cats = await getListaSuperWP();
    let texto = '🛒 *Lista del súper*\n\n';
    let totalItems = 0;

    SHOP_CATS.forEach((nombre, i) => {
      const items = (cats[`cat${i}`] || []).filter(it => !it.done);
      if (items.length > 0) {
        texto += `*${nombre}:*\n`;
        texto += items.map(it => `☐ ${it.text}`).join('\n') + '\n\n';
        totalItems += items.length;
      }
    });

    if (totalItems === 0) texto += '_Lista vacía_ 🎉\n';

    await bot.sendMessage(chatId, texto, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '+ Agregar item', callback_data: 'super_elegir_cat' }],
        [{ text: '✓ Marcar comprado', callback_data: 'super_marcar_menu' }],
        [{ text: '← Menú', callback_data: 'cmd_menu' }],
      ]}
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error cargando lista.');
    console.error(e);
  }
}
bot.onText(/\/super/, (msg) => mostrarSuper(msg.chat.id));

async function mostrarCatsSuper(chatId) {
  const botones = SHOP_CATS.map((cat, i) => [{ text: cat, callback_data: `super_cat_${i}` }]);
  botones.push([{ text: '← Lista', callback_data: 'cmd_super' }]);
  await bot.sendMessage(chatId, '¿A qué categoría?', { reply_markup: { inline_keyboard: botones } });
}

// --- TAREA ---

async function iniciarTarea(chatId) {
  userState[chatId] = { modo: 'tarea_escribiendo' };
  await bot.sendMessage(chatId, '📋 ¿Qué tarea agregamos a tu semana?');
}
bot.onText(/\/tarea/, (msg) => iniciarTarea(msg.chat.id));

// --- PENDIENTE ---

async function iniciarPendiente(chatId) {
  userState[chatId] = { modo: 'pendiente_escribiendo' };
  await bot.sendMessage(chatId, '📌 ¿Qué pendiente agregamos?');
}
bot.onText(/\/pendiente/, (msg) => iniciarPendiente(msg.chat.id));

// --- DATOS IMPORTANTES (MEMORIA) ---

async function mostrarDatos(chatId) {
  try {
    const datos = await getDatosImportantes();
    if (datos.length === 0) {
      await bot.sendMessage(chatId,
        '🧠 No tienes datos importantes guardados aún.\n\nEscribe *"Dato importante: ..."* o *"Recuerda que: ..."* y lo guardo para siempre.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    let texto = '🧠 *Datos importantes guardados:*\n\n';
    datos.forEach((d, i) => {
      texto += `${i + 1}. ${d.texto}\n_${d.fecha}_\n\n`;
    });

    const botones = datos.map(d => [{
      text: `🗑 ${d.texto.slice(0, 35)}${d.texto.length > 35 ? '...' : ''}`,
      callback_data: `borrar_dato_${d.id}`
    }]);
    botones.push([{ text: '← Menú', callback_data: 'cmd_menu' }]);

    await bot.sendMessage(chatId, texto, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: botones }
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error cargando datos.');
    console.error(e);
  }
}
bot.onText(/\/datos/, (msg) => mostrarDatos(msg.chat.id));

// --- RECETAS ---

async function generarRecetas(chatId) {
  await bot.sendMessage(chatId, '🍳 Generando recetas...');
  try {
    const prompt = `Genera 3 recetas sanas, altas en proteína, fáciles con ingredientes de Mérida, México.
Para cada una: nombre, ingredientes principales, tiempo, y por qué es buena para alguien que entrena fuerte.
Formato limpio, español mexicano natural.`;
    const respuesta = await llamarClaude(prompt);
    userState[chatId] = { modo: 'receta_lista', ultimaReceta: respuesta };
    await bot.sendMessage(chatId, `🍳 *Recetas:*\n\n${respuesta}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '🛒 Agregar ingredientes al súper', callback_data: 'receta_a_super' }],
        [{ text: '← Menú', callback_data: 'cmd_menu' }],
      ]}
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando recetas.');
    console.error(e);
  }
}
bot.onText(/\/recetas/, (msg) => generarRecetas(msg.chat.id));

async function checkinEmocional(chatId) {
  userState[chatId] = { modo: 'como' };
  await bot.sendMessage(chatId, '😮‍💨 ¿Cómo estás ahorita, en serio? Escribe lo que es.');
}
bot.onText(/\/como/, (msg) => checkinEmocional(msg.chat.id));

async function mostrarProgreso(chatId) {
  await bot.sendMessage(chatId, '📊 Analizando tu semana...');
  try {
    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    const [avancesSnap, entSnap] = await Promise.all([
      db.collection('avances').where('timestamp', '>=', inicioSemana).orderBy('timestamp', 'desc').get(),
      db.collection('entrenamientos').where('timestamp', '>=', inicioSemana).get(),
    ]);

    const avances = avancesSnap.docs.map(d => d.data());
    const entrenamientos = entSnap.docs.map(d => d.data());
    const tareas = await getTareasHoy();

    const resumen = `Esta semana:
- Avances en metas: ${avances.length} (${[...new Set(avances.map(a => a.metaId))].length} metas distintas)
- Entrenamientos registrados: ${entrenamientos.length}
- En el planner esta semana: ${tareas.join(', ') || 'sin tareas registradas'}
Detalle avances: ${avances.slice(0, 5).map(a => `[${a.metaId}] ${a.texto.slice(0, 60)}`).join(' | ')}`;

    const respuesta = await llamarClaude(
      `Genera un resumen motivador pero real de la semana de Fernanda.\n\n${resumen}\n\nCierra con algo específico y personal, no genérico.`
    );
    await bot.sendMessage(chatId, `📊 *Tu semana:*\n\n${respuesta}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando progreso.');
    console.error(e);
  }
}
bot.onText(/\/progreso/, (msg) => mostrarProgreso(msg.chat.id));

// === CALLBACK QUERIES ===

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);
  const estado = userState[chatId] || {};

  if (data === 'cmd_menu') {
    await bot.sendMessage(chatId, '¿Qué hacemos?', { reply_markup: menuKeyboard() });
  } else if (data === 'cmd_journal') {
    await iniciarJournal(chatId);
  } else if (data === 'cmd_metas') {
    await mostrarMetas(chatId);
  } else if (data === 'cmd_avance') {
    await iniciarAvance(chatId);
  } else if (data === 'cmd_acciones') {
    await generarAcciones(chatId);
  } else if (data === 'cmd_super') {
    await mostrarSuper(chatId);
  } else if (data === 'cmd_recetas') {
    await generarRecetas(chatId);
  } else if (data === 'cmd_como') {
    await checkinEmocional(chatId);
  } else if (data === 'cmd_progreso') {
    await mostrarProgreso(chatId);
  } else if (data === 'cmd_gasto') {
    await iniciarGasto(chatId);
  } else if (data === 'cmd_tarea') {
    await iniciarTarea(chatId);
  } else if (data === 'cmd_datos') {
    await mostrarDatos(chatId);
  } else if (data.startsWith('borrar_dato_')) {
    const datoId = data.replace('borrar_dato_', '');
    await borrarDatoImportante(datoId);
    await bot.sendMessage(chatId, '✓ Dato borrado.');
    await mostrarDatos(chatId);

  // METAS
  } else if (data.startsWith('ver_meta_')) {
    const metaId = data.replace('ver_meta_', '');
    const meta = METAS.find(m => m.id === metaId);
    if (!meta) return;
    const nota = await db.collection('notas_metas').doc(metaId).get();
    const textoNota = nota.exists ? nota.data().texto : 'Sin nota registrada aún.';
    await bot.sendMessage(chatId, `🎯 *${meta.nombre}*\n\n${textoNota}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '✅ Registrar avance', callback_data: `avance_meta_${metaId}` }],
        [{ text: '← Mis metas', callback_data: 'cmd_metas' }],
      ]},
    });
  } else if (data.startsWith('avance_meta_')) {
    const metaId = data.replace('avance_meta_', '');
    const meta = METAS.find(m => m.id === metaId);
    userState[chatId] = { modo: 'avance_escribiendo', metaId, metaNombre: meta?.nombre };
    await bot.sendMessage(chatId, `✅ *${meta?.nombre}*\n\n¿Qué hiciste hacia esta meta?`, { parse_mode: 'Markdown' });

  // GASTOS
  } else if (data.startsWith('gastog_')) {
    const idx = parseInt(data.replace('gastog_', ''));
    const grupo = estado.grupos?.[idx];
    if (!grupo) return;
    userState[chatId] = { ...estado, modo: 'gasto_eligiendo_sub', grupo };
    const botones = grupo.subs.map((s, i) => [{ text: s.name, callback_data: `gastos_${i}` }]);
    botones.push([{ text: '← Áreas', callback_data: 'cmd_gasto' }]);
    await bot.sendMessage(chatId, `*${grupo.name}* — ¿Subcategoría?`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: botones }
    });
  } else if (data.startsWith('gastos_')) {
    const idx = parseInt(data.replace('gastos_', ''));
    const sub = estado.grupo?.subs?.[idx];
    if (!sub) return;
    userState[chatId] = { ...estado, modo: 'gasto_esperando_monto', sub };
    if (estado.monto) {
      await confirmarGasto(chatId, estado.grupo, sub, estado.monto);
    } else {
      await bot.sendMessage(chatId, `${estado.grupo.name} → ${sub.name}\n\n¿Cuánto fue? (solo el número)`);
    }

  // SÚPER — agregar
  } else if (data === 'super_elegir_cat') {
    await mostrarCatsSuper(chatId);
  } else if (data.startsWith('super_cat_')) {
    const catIdx = parseInt(data.replace('super_cat_', ''));
    userState[chatId] = { modo: 'super_agregar', catIdx };
    await bot.sendMessage(chatId,
      `¿Qué agregas a *${SHOP_CATS[catIdx]}*?\n(uno o varios separados por coma)`,
      { parse_mode: 'Markdown' }
    );

  // SÚPER — marcar comprado
  } else if (data === 'super_marcar_menu') {
    const cats = await getListaSuperWP();
    const botones = [];
    SHOP_CATS.forEach((nombre, i) => {
      (cats[`cat${i}`] || []).filter(it => !it.done).forEach((it, j) => {
        botones.push([{ text: `${nombre}: ${it.text}`, callback_data: `supermark_${i}_${j}` }]);
      });
    });
    if (botones.length === 0) {
      await bot.sendMessage(chatId, '¡Lista vacía! 🎉');
      return;
    }
    botones.push([{ text: '← Lista', callback_data: 'cmd_super' }]);
    await bot.sendMessage(chatId, 'Toca para marcar como comprado:', { reply_markup: { inline_keyboard: botones } });
  } else if (data.startsWith('supermark_')) {
    const parts = data.split('_');
    const catIdx = parseInt(parts[1]);
    const itemIdx = parseInt(parts[2]);
    const catKey = `cat${catIdx}`;
    const cats = await getListaSuperWP();
    const items = [...(cats[catKey] || [])];
    const pendientes = items.filter(it => !it.done);
    if (pendientes[itemIdx]) {
      const itemText = pendientes[itemIdx].text;
      const fullIdx = items.findIndex(it => !it.done && it.text === itemText);
      if (fullIdx >= 0) {
        items[fullIdx] = { ...items[fullIdx], done: true };
        await wpUser().doc('shopping').update({ [`cats.${catKey}`]: items });
        await bot.sendMessage(chatId, `✓ "${itemText}" comprado 🛍️`);
      }
    }

  // RECETA → SÚPER
  } else if (data === 'receta_a_super') {
    const receta = estado?.ultimaReceta || '';
    if (!receta) {
      await bot.sendMessage(chatId, 'Primero genera una receta con /recetas');
      return;
    }
    const prompt = `Extrae solo los ingredientes de esta receta (una línea por item, sin cantidades, sin bullets):\n\n${receta}`;
    const ingredientes = await llamarClaude(prompt);
    const items = ingredientes.split('\n').map(i => i.trim()).filter(i => i.length > 2);
    for (const item of items) {
      await agregarItemSuperWP(item, 0);
    }
    await bot.sendMessage(chatId, `✓ ${items.length} ingredientes en Supermercado:\n${items.join(', ')}`);
  }
});

// === MENSAJES LIBRES ===

async function procesarTexto(chatId, texto) {
  const estado = userState[chatId] || {};

  try {
    // JOURNAL
    if (estado.modo === 'journal') {
      const detectados = await detectarYRegistrar(chatId, texto);
      await guardarAvance('journal', texto, 'journal');
      await guardarMensajeConversacion('user', texto);
      const extraCtx = /mamá|mama/i.test(texto)
        ? 'Mencionó a su mamá. Responde con empatía real, reconoce lo que implica cuidarla. Sin sonar como psicólogo.'
        : '';
      const { texto: respuesta, acciones } = await llamarClaudeConMemoria(texto, extraCtx);
      await guardarMensajeConversacion('assistant', respuesta);
      let mensajeFinal = respuesta;
      const todasAcciones = [...detectados, ...acciones];
      if (todasAcciones.length > 0) mensajeFinal += `\n\n_${todasAcciones.join(' · ')}_`;
      await bot.sendMessage(chatId, mensajeFinal, { parse_mode: 'Markdown' });
      return;
    }

    // AVANCE
    if (estado.modo === 'avance_escribiendo') {
      await guardarAvance(estado.metaId, texto);
      const respuesta = await llamarClaude(
        `Fernanda registró este avance en su meta "${estado.metaNombre}": "${texto}". Responde con confirmación breve y algo específico que la motive.`
      );
      await bot.sendMessage(chatId, respuesta);
      userState[chatId] = null;
      await bot.sendMessage(chatId, '¿Qué más?', { reply_markup: menuKeyboard() });
      return;
    }

    // CÓMO ESTOY
    if (estado.modo === 'como') {
      const esStresAlto = /agotada|estresada|mal|horrible|no puedo|cansada|frustrada/i.test(texto);
      const extraCtx = esStresAlto
        ? 'Detecta estrés alto. Empatía real, sin minimizar. Al final sugiere sutilmente: respirar, caminar, o escribirle más al bot en lugar de abrir redes sociales.'
        : '';
      const respuesta = await llamarClaude(texto, extraCtx);
      await db.collection('consciencia').add({
        texto, tipo: 'checkin_emocional',
        fecha: new Date().toLocaleDateString('es-MX'),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await bot.sendMessage(chatId, respuesta);
      userState[chatId] = null;
      return;
    }

    // SÚPER — agregar item
    if (estado.modo === 'super_agregar') {
      const items = texto.split(',').map(i => i.trim()).filter(i => i);
      for (const item of items) {
        await agregarItemSuperWP(item, estado.catIdx);
      }
      await bot.sendMessage(chatId, `✓ Agregado a ${SHOP_CATS[estado.catIdx]}: ${items.join(', ')}`);
      userState[chatId] = null;
      await mostrarSuper(chatId);
      return;
    }

    // GASTO — esperando monto
    if (estado.modo === 'gasto_esperando_monto') {
      const monto = parseFloat(texto.replace(/[^0-9.]/g, ''));
      if (isNaN(monto) || monto <= 0) {
        await bot.sendMessage(chatId, '¿Cuánto fue? (solo el número, ej: 250)');
        return;
      }
      await confirmarGasto(chatId, estado.grupo, estado.sub, monto);
      return;
    }

    // TAREA
    if (estado.modo === 'tarea_escribiendo') {
      await agregarTareaWP(texto);
      await bot.sendMessage(chatId, `✅ Tarea agregada a tu semana:\n"${texto}"`);
      userState[chatId] = null;
      return;
    }

    // PENDIENTE
    if (estado.modo === 'pendiente_escribiendo') {
      await agregarPendienteWP(texto);
      await bot.sendMessage(chatId, `📌 Pendiente guardado:\n"${texto}"`);
      userState[chatId] = null;
      return;
    }

    // Mensaje libre — Claude con memoria completa y tool use real
    await guardarMensajeConversacion('user', texto);
    const { texto: respuesta, acciones } = await llamarClaudeConMemoria(texto);
    await guardarMensajeConversacion('assistant', respuesta);
    let mensajeFinal = respuesta;
    if (acciones.length > 0) mensajeFinal += `\n\n_${acciones.join(' · ')}_`;
    await bot.sendMessage(chatId, mensajeFinal, { parse_mode: 'Markdown' });

  } catch (e) {
    console.error('Error procesando mensaje:', e);
    await bot.sendMessage(chatId, 'Algo salió mal. Intenta de nuevo.');
  }
}

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  await procesarTexto(msg.chat.id, msg.text);
});

// === NOTAS DE VOZ ===

async function transcribirAudio(fileId) {
  const fileLink = await bot.getFileLink(fileId);
  const audioRes = await fetch(fileLink);
  const audioBuffer = await audioRes.arrayBuffer();

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'es');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.text;
}

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendChatAction(chatId, 'typing');
    const texto = await transcribirAudio(msg.voice.file_id);
    if (!texto || !texto.trim()) {
      await bot.sendMessage(chatId, 'No pude entender el audio, ¿lo escribes?');
      return;
    }
    await bot.sendMessage(chatId, `🎤 _"${texto}"_`, { parse_mode: 'Markdown' });
    await procesarTexto(chatId, texto);
  } catch (e) {
    console.error('Error transcribiendo audio:', e);
    await bot.sendMessage(chatId, 'No pude procesar la nota de voz. Intenta de nuevo o escríbelo.');
  }
});

// === MENSAJES AUTOMÁTICOS ===

async function generarMensajeAutomatico(instruccion) {
  try {
    const ctx = await getContextoDia();
    const hoy = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaHoy = dias[hoy.getDay()];
    const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Merida' }).format(hoy);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Hoy es ${diaHoy} ${fecha}.\n${ctx}\n\n${instruccion}`,
      }],
    });
    return response.content.find(b => b.type === 'text')?.text || '';
  } catch (e) {
    console.error('generarMensajeAutomatico error:', e);
    return null;
  }
}

if (FERNANDA_CHAT_ID) {
  // 7:35am — DAILY BRIEF (5 min después del sync de Garmin para tener datos frescos)
  cron.schedule('35 7 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el Daily Brief de las 7:30am. Incluye: cómo durmió según Garmin, Body Battery, estrés, HRV si hay, fase del ciclo con interpretación breve, recordatorio de no tomar café en ayunas (primero agua o algo suave), movimiento recomendado para hoy según ciclo+Garmin, desayuno concreto, enfoques del día, pendientes que tienen sentido para su energía de hoy, y motivación adaptada. Si hay creatina en el contexto, recuérdale tomarla con el desayuno. Sé específica, útil y cero genérica.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 7:35am error:', e); }
  }, { timezone: 'America/Merida' });

  // 11:25am — CAMBIO DE CONTEXTO (lun-vie)
  cron.schedule('25 11 * * 1-5', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de las 11:25am para ayudarla a cambiar de modo. Reconoce que está terminando su bloque más valioso. Pregunta si quiere seguir en compu o pasar a modo casa 40 min (sugiere tareas del hogar concretas: tender cama, cocina, lavadora, descongelar comida). Recuerda menú del día según su ciclo. Sé breve y directa, que la ayude a decidir rápido qué sigue.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 11:25am error:', e); }
  }, { timezone: 'America/Merida' });

  // 2:00pm — SEGUNDA MITAD
  cron.schedule('0 14 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de las 2pm. Ayúdala a decidir cómo usar el resto del día según Garmin y ciclo. Muestra qué pendientes siguen abiertos si hay. Ofrécele modos: seguir trabajando, resolver casa, moverse/salir, o descansar sin culpa. Si es martes o jueves, recuerda equitación a las 4:50pm. Sé breve, que tome la decisión en 10 segundos.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 2pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 4:00pm — CORTISOL CHECK
  cron.schedule('0 16 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el Cortisol Check de las 4pm. Pregunta cómo va su cuerpo (energía y estrés en escala simple). Compara con datos de Garmin si hay. Recomienda UNA acción pequeña de regulación: agua, jardín, caminar 5 min, respirar, snack proteico, acariciar a los perros, cerrar pestañas. Si es martes o jueves recuerda equitación a las 4:50pm. Súper breve.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 4pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 6:00pm — GASTOS Y PENDIENTES PEQUEÑOS
  cron.schedule('0 18 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de las 6pm. Pregunta si tuvo algún gasto hoy (formato fácil: "Gasté $X en Y"). Pregunta si hay UN pendiente de menos de 10 minutos que valga resolverlo antes de la noche. Si no, cerramos. No todo tiene que quedar perfecto hoy. Breve y sin presión.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 6pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 8:30pm — PREPARAR EL MAÑANA
  cron.schedule('30 20 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de las 8:30pm para bajar la carga mental nocturna. Pregunta: ¿perros ya cenaron?, ¿Benito tiene comida?, ¿algo que descongelar para mañana?, ¿ropa del entrenamiento lista? Revisa qué tiene temprano mañana. Sugiere cena ligera adaptada al ciclo y metas. Si mañana es lunes recuerda violín a las 7pm. Si mañana hay gym/natación/equitación, recuerda preparar la ropa/equipo. Sé cálida y práctica.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 8:30pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 9:30pm — MEDICAMENTOS Y CIERRE
  cron.schedule('30 21 * * *', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de cierre de las 9:30pm. Recuerda: espironolactona, magnesio y minoxidil. Pregunta si faltó registrar algún gasto. Invítala a soltar el teléfono. Muy breve, cálido, que sienta que el día ya puede cerrarse tranquilo.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 9:30pm error:', e); }
  }, { timezone: 'America/Merida' });

  // Domingo 7:00pm — PLANEACIÓN SEMANAL
  cron.schedule('0 19 * * 0', async () => {
    try {
      const msg = await generarMensajeAutomatico(
        'Genera el mensaje de planeación semanal del domingo 7pm. Enfócate en la PRÓXIMA semana: qué fase del ciclo le toca, cómo organizar movimiento/trabajo/comida/descanso en consecuencia. Pregunta si pidió el súper y revisa que tenga lo básico (huevos, yogurt, proteína, fruta, verduras). Pregunta por Atlas, perros, ropa de entrenamiento. Pregunta cuál es UNA cosa que haría que la semana se sienta más tranquila. Sé práctica y energizante, no intensa.'
      );
      if (msg) await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron domingo error:', e); }
  }, { timezone: 'America/Merida' });

  console.log('✓ Mensajes automáticos activados para Chat ID:', FERNANDA_CHAT_ID);
} else {
  console.log('⚠️ FERNANDA_CHAT_ID no configurado');
}

console.log('🤖 Bot Semana Perfecta v2 iniciado — conectado a Weekly Planner');
bot.on('polling_error', (error) => console.error('Polling error:', error.code));
