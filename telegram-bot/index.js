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
const SYSTEM_PROMPT = `Eres el asistente personal de Fernanda. La conoces bien.

Sobre ella:
- Vive en Mérida, México. Se despierta entre 4-5am.
- Entrena: tennis mar/jue 5am, natación mar/jue 8am, gym lun 6am. También pilates, barre, apnea, escalar, patinar y correr.
- Animales: caballo Atlas (2 años), perro Rogelio, víbora Sombra, gato Benito.
- Está lanzando https://app.myweeklyplanner.app — faltan bugs y estrategia de marketing.
- Aprende AI, automatizaciones y vibe coding.
- Tiene deuda de tarjetas, pagándola activamente.
- Cuida a su mamá con discapacidad. Viven de los ingresos de su mamá por ahora.
- Su mayor reto es el scroll de redes sociales — no lo menciones tú primero.
- Bloques de trabajo: 9-10:30am profundo (lun/mar/jue), mié y vie empieza a las 10am.

Lo que SÍ puedes hacer (tienes acceso real a su Weekly Planner y Firebase):
- Ver y agregar tareas a su semana en el planner
- Guardar pendientes en su lista de pendientes
- Registrar gastos en su presupuesto
- Ver y agregar items a su lista del súper
- Guardar avances en sus 13 metas
- Recordar datos importantes que ella te diga

Cuando ella pida algo de esto, confirma que lo hiciste — porque el bot ya lo ejecuta automáticamente. Nunca digas que no tienes acceso a su planner, porque sí lo tienes.

Tu estilo:
- Directo, cálido, real. Sin sermones ni listas de 5 puntos.
- Respondes a lo que dijo, no a lo que podrías preguntar.
- Si algo no quedó claro, haces UNA pregunta. Solo una.
- Nunca bombardeas con preguntas. Nunca.
- Español mexicano natural, algo de inglés, alguna palabra en francés de vez en cuando.
- Máximo 2-3 párrafos cortos. Menos es más.`;

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
  const fecha = new Date().toISOString().split('T')[0];
  const id = 't' + Date.now();
  const doc = await wpUser().doc('pending_tasks').get();
  const tasks = doc.exists ? (doc.data().tasks || []) : [];
  tasks.push({ id, text: texto, addedDate: fecha });
  await wpUser().doc('pending_tasks').set({ tasks });
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

// === CLAUDE API ===

async function llamarClaude(userMessage, contextoExtra = '') {
  const systemFinal = contextoExtra
    ? `${SYSTEM_PROMPT}\n\nContexto adicional:\n${contextoExtra}`
    : SYSTEM_PROMPT;
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemFinal,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0]?.text || '';
}

async function llamarClaudeConMemoria(userMessage, extraCtx = '') {
  try {
    const [datos, historial] = await Promise.all([
      getDatosImportantes(),
      getHistorialReciente(30),
    ]);

    let systemFinal = SYSTEM_PROMPT;
    if (datos.length > 0) {
      systemFinal += '\n\n## Lo que recuerdas de Fernanda (datos importantes guardados):\n'
        + datos.map(d => `- ${d.texto}`).join('\n');
    }
    if (extraCtx) {
      systemFinal += '\n\nContexto adicional:\n' + extraCtx;
    }

    const messages = [
      ...historial.map(m => ({ role: m.role, content: m.texto })),
      { role: 'user', content: userMessage },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemFinal,
      messages,
    });
    return response.content[0]?.text || '';
  } catch (e) {
    console.error('llamarClaudeConMemoria error:', e);
    return llamarClaude(userMessage, extraCtx);
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

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const texto = msg.text;
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
      const respuesta = await llamarClaudeConMemoria(texto, extraCtx);
      await guardarMensajeConversacion('assistant', respuesta);
      let mensajeFinal = respuesta;
      if (detectados.length > 0) mensajeFinal += `\n\n_${detectados.join(' · ')}_`;
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

    // AUTO-DETECCIÓN: dato importante
    const matchDato = texto.match(/^(?:dato importante|recuerda que)[:：]\s*(.+)/i);
    if (matchDato) {
      const datoTexto = matchDato[1].trim();
      await guardarDatoImportante(datoTexto);
      await bot.sendMessage(chatId,
        `✅ Guardado en mi memoria:\n"${datoTexto}"\n\n_Lo voy a recordar siempre._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // AUTO-DETECCIÓN: gasto en texto libre
    const gastoVerbo = /gast[eé]|pagu[eé]|cost[oó]|compr[eé]|pagamos|salió/i.test(texto);
    const gastoMatch = texto.match(/\$(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:pesos?|mxn)/i);
    if (gastoVerbo && gastoMatch) {
      const montoStr = (gastoMatch[1] || gastoMatch[2]).replace(',', '.');
      const monto = parseFloat(montoStr);
      await iniciarGasto(chatId, monto);
      return;
    }

    // AUTO-DETECCIÓN: agregar tarea explícita
    const matchTarea = texto.match(/^(?:agrega(?:r)?|añade?|pon|mete)\s+(?:(?:esto?|eso|la tarea|una tarea)\s+)?(?:a\s+)?(?:mis\s+tareas?|el\s+planner|mi\s+semana)[:\s]+(.+)/i)
      || texto.match(/^tarea[:\s]+(.+)/i);
    if (matchTarea) {
      const tareaTexto = matchTarea[1].trim();
      await agregarTareaWP(tareaTexto);
      await bot.sendMessage(chatId, `✅ Tarea agregada a tu semana:\n"${tareaTexto}"`);
      return;
    }

    // AUTO-DETECCIÓN: agregar pendiente explícita
    const matchPendiente = texto.match(/^(?:agrega(?:r)?|añade?|pon|mete|guarda)\s+(?:(?:esto?|eso|el\s+pendiente|un\s+pendiente)\s+)?(?:a\s+)?(?:mis\s+pendientes?|mi\s+lista)[:\s]+(.+)/i)
      || texto.match(/^pendiente[:\s]+(.+)/i);
    if (matchPendiente) {
      const pendTexto = matchPendiente[1].trim();
      await agregarPendienteWP(pendTexto);
      await bot.sendMessage(chatId, `📌 Pendiente guardado:\n"${pendTexto}"`);
      return;
    }

    // AUTO-DETECCIÓN: pendiente en texto libre
    if (/tengo que|hay que|necesito|debo(?! a)|me falta|recordarme/i.test(texto)) {
      await agregarPendienteWP(texto);
      const respuesta = await llamarClaude(texto);
      await bot.sendMessage(chatId, respuesta + '\n\n_📌 Guardado en tus pendientes._', { parse_mode: 'Markdown' });
      return;
    }

    // Mensaje libre — Claude con memoria completa
    await guardarMensajeConversacion('user', texto);
    const respuesta = await llamarClaudeConMemoria(texto);
    await guardarMensajeConversacion('assistant', respuesta);
    await bot.sendMessage(chatId, respuesta);

  } catch (e) {
    console.error('Error procesando mensaje:', e);
    await bot.sendMessage(chatId, 'Algo salió mal. Intenta de nuevo.');
  }
});

// === MENSAJES AUTOMÁTICOS ===

if (FERNANDA_CHAT_ID) {
  // BRIEFING MAÑANA — 6:00am todos los días
  cron.schedule('0 6 * * *', async () => {
    try {
      const hoy = new Date();
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const diaHoy = dias[hoy.getDay()];
      const entrenamientosDia = {
        Lunes: 'Gym 💪',
        Martes: 'Tennis 🎾 + Natación 🏊‍♀️ + Equitación 🐴',
        Jueves: 'Tennis 🎾 + Natación 🏊‍♀️ + Equitación 🐴',
      };
      const entHoy = entrenamientosDia[diaHoy];
      const tareas = await getTareasHoy();

      let mensaje = `Buenos días Fer ☀️ Hoy es *${diaHoy}*.\n\n`;
      if (entHoy) mensaje += `🏃‍♀️ *Entrenas hoy:* ${entHoy}\n\n`;
      if (tareas.length > 0) {
        mensaje += `📋 *En tu planner:*\n${tareas.slice(0, 5).map(t => `• ${t}`).join('\n')}\n\n`;
      }
      mensaje += `¿Cómo amaneciste de energía? 🔋`;

      await bot.sendMessage(FERNANDA_CHAT_ID, mensaje, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron 6am error:', e); }
  }, { timezone: 'America/Merida' });

  // CIERRE BLOQUE PROFUNDO — 10:25am lun-vie
  cron.schedule('25 10 * * 1-5', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'En 5 min termina tu bloque de trabajo profundo. ¿Qué lograste esta mañana?'
      );
    } catch (e) { console.error('Cron 10:25am error:', e); }
  }, { timezone: 'America/Merida' });

  // CIERRE MAÑANA — 12:55pm lun-vie
  cron.schedule('55 12 * * 1-5', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Hora de cerrar la mañana. ¿Qué fue lo más importante que hiciste hoy?'
      );
    } catch (e) { console.error('Cron 12:55pm error:', e); }
  }, { timezone: 'America/Merida' });

  // GASTOS — 6:30pm todos los días
  cron.schedule('30 18 * * *', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        '💸 ¿Tuviste algún gasto hoy?\n\nPuedes decirme "gasté $X en Y" o usar /gasto'
      );
    } catch (e) { console.error('Cron gastos error:', e); }
  }, { timezone: 'America/Merida' });

  // NOCTURNO — 9:00pm todos los días
  cron.schedule('0 21 * * *', async () => {
    try {
      const tareas = await getTareasHoy();
      const tareasTexto = tareas.length > 0
        ? `\n\nTenías en el planner: ${tareas.slice(0, 3).join(', ')}.`
        : '';
      await bot.sendMessage(FERNANDA_CHAT_ID,
        `El día se acaba 🌙${tareasTexto}\n\n¿Cómo estuvo? ¿Qué emociones cargaste hoy?`
      );
    } catch (e) { console.error('Cron 9pm error:', e); }
  }, { timezone: 'America/Merida' });

  // PROGRESO SEMANAL — Domingo 7:00pm
  cron.schedule('0 19 * * 0', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Es domingo Fer 📊 ¿Cómo fue tu semana? Escribe /progreso para ver el resumen.'
      );
    } catch (e) { console.error('Cron domingo error:', e); }
  }, { timezone: 'America/Merida' });

  console.log('✓ Mensajes automáticos activados para Chat ID:', FERNANDA_CHAT_ID);
} else {
  console.log('⚠️ FERNANDA_CHAT_ID no configurado');
}

console.log('🤖 Bot Semana Perfecta v2 iniciado — conectado a Weekly Planner');
bot.on('polling_error', (error) => console.error('Polling error:', error.code));
