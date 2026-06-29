require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const cron = require('node-cron');
const METAS = require('./metas');

// === FIREBASE ADMIN ===
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// === CLIENTES ===
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const FERNANDA_CHAT_ID = process.env.FERNANDA_CHAT_ID;

// Estado de flujos multi-paso por chat
const userState = {};

// === SISTEMA DE PERSONALIDAD ===
const SYSTEM_PROMPT = `Eres el asistente personal de Fernanda. La conoces bien.

Sobre ella:
- Vive en Mérida, México. Se despierta entre 4-5am.
- Entrena: tennis mar/jue 5am, natación mar/jue 8am, gym lun 6am. También pilates, barre, apnea, escalar, patinar y correr de vez en cuando.
- Animales: caballo Atlas (2 años), perro Rogelio, víbora Sombra, gato Benito.
- Está lanzando https://app.myweeklyplanner.app — faltan bugs y estrategia de marketing.
- Acaba de terminar un bot de WhatsApp para un cliente llamado Moisés, sin cobrar, fue entrenamiento y le gustó mucho.
- Aprende AI, automatizaciones y vibe coding.
- Tiene deuda de $312,000 pesos en tarjetas, pagándola activamente.
- Cuida a su mamá con discapacidad. Viven de los ingresos de su mamá por ahora.
- Su mayor reto es el scroll de redes sociales — pero no lo menciones tú primero, espera a que ella lo traiga.
- Bloques de trabajo: 9-10:30am trabajo profundo (lun/mar/jue), miércoles y viernes empieza a las 10am. 10:30-11am quehacer sin cel. 11am-12:30pm AI/clientes.

Tu estilo:
- Directo, cálido, real. Sin sermones ni listas de 5 puntos.
- Respondes a lo que dijo, no a lo que podrías preguntar.
- Si algo no quedó claro, haces UNA pregunta. Solo una.
- Nunca bombardeas con preguntas. Nunca.
- Español mexicano natural, algo de inglés, alguna palabra en francés de vez en cuando.
- Máximo 2-3 párrafos cortos. Menos es más.`;

// === HELPERS FIRESTORE ===

async function guardarAvance(metaId, texto, tipo = 'avance') {
  const ahora = new Date();
  const fecha = `${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()}`;
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  await db.collection('avances').add({
    metaId,
    texto,
    fecha: `${fecha} ${hora}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    tipo,
    fuente: 'telegram',
  });
}

async function getAvancesRecientes(limite = 10) {
  const snap = await db.collection('avances')
    .orderBy('timestamp', 'desc')
    .limit(limite)
    .get();
  return snap.docs.map(d => d.data());
}

async function getProgresoMeta(metaId) {
  const doc = await db.collection('progreso').doc(metaId).get();
  return doc.exists ? doc.data() : {};
}

async function getListaSuper() {
  const snap = await db.collection('lista_super')
    .orderBy('timestamp', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// === CLAUDE API ===

async function llamarClaude(userMessage, contextoExtra = '') {
  const systemFinal = contextoExtra ? `${SYSTEM_PROMPT}\n\nContexto adicional:\n${contextoExtra}` : SYSTEM_PROMPT;
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: systemFinal,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0]?.text || '';
}

// === DETECCIÓN DE KEYWORDS EN JOURNAL ===

async function detectarYRegistrar(chatId, texto) {
  const lower = texto.toLowerCase();
  const ahora = new Date();
  const fecha = `${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()}`;
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const ts = admin.firestore.FieldValue.serverTimestamp();

  const acciones = [];

  // Entrenamiento
  const entrenamientos = ['tennis', 'tenis', 'natación', 'nadar', 'gym', 'gimnasio', 'pilates', 'equitación', 'caballo', 'atlas'];
  const tipoEntrenamiento = entrenamientos.find(k => lower.includes(k));
  if (tipoEntrenamiento) {
    await db.collection('entrenamientos').add({ tipo: tipoEntrenamiento, fecha, hora, nota: texto, timestamp: ts });
    acciones.push('entrenamiento registrado ✓');
    if (lower.includes('atlas') || lower.includes('caballo')) {
      await guardarAvance('granja', texto, 'visita_atlas');
      acciones.push('visita a Atlas guardada en meta Granja ✓');
    }
  }

  // Consciencia con el celular / redes
  const redesKeywords = ['instagram', 'tiktok', 'redes', 'scroll', 'cel ', 'celular', 'twitter', 'x.com'];
  if (redesKeywords.some(k => lower.includes(k))) {
    await db.collection('consciencia').add({ texto, fecha, hora, timestamp: ts });
    acciones.push('momento de consciencia registrado ✓');
  }

  // Tecnología / app
  const techKeywords = ['bug', 'app', 'planner', 'código', 'deploy', 'programé', 'programar', 'vibe coding', 'automatización'];
  if (techKeywords.some(k => lower.includes(k))) {
    await guardarAvance('tecnologia', texto, 'journal');
    acciones.push('avance en meta Tecnología registrado ✓');
  }

  // Sombra (víbora)
  if (lower.includes('sombra')) {
    acciones.push('¡Le prestaste atención a Sombra! 🐍');
  }

  return acciones;
}

// === MENÚ PRINCIPAL ===

function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📓 Journal', callback_data: 'cmd_journal' }, { text: '🎯 Mis metas', callback_data: 'cmd_metas' }],
      [{ text: '✅ Registrar avance', callback_data: 'cmd_avance' }, { text: '💪 Acciones de hoy', callback_data: 'cmd_acciones' }],
      [{ text: '🛒 Lista del súper', callback_data: 'cmd_super' }, { text: '🍳 Recetas sanas', callback_data: 'cmd_recetas' }],
      [{ text: '😮‍💨 Cómo estoy', callback_data: 'cmd_como' }, { text: '📊 Mi progreso semanal', callback_data: 'cmd_progreso' }],
    ],
  };
}

// === COMANDO /start ===

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log('Chat ID de Fernanda:', chatId);

  await bot.sendMessage(chatId,
    `Hola Fer 👋\n\nSoy tu asistente personal. Te ayudo a registrar avances, escribir en tu journal, generar acciones del día y más — todo conectado a tu Semana Perfecta.\n\nTu Chat ID es: \`${chatId}\` (guárdalo en las variables de entorno del bot como FERNANDA_CHAT_ID)\n\n¿Qué hacemos?`,
    { parse_mode: 'Markdown', reply_markup: menuKeyboard() }
  );
});

// === COMANDO /menu ===

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '¿Qué hacemos?', { reply_markup: menuKeyboard() });
});

// === COMANDO /journal ===

async function iniciarJournal(chatId) {
  userState[chatId] = { modo: 'journal' };
  await bot.sendMessage(chatId,
    '📓 Modo journal activado. Escribe lo que quieras — cómo vas, qué piensas, cómo te sientes. Yo escucho y respondo.\n\nEscribe /menu cuando quieras salir.'
  );
}

bot.onText(/\/journal/, (msg) => iniciarJournal(msg.chat.id));

// === COMANDO /metas ===

async function mostrarMetas(chatId) {
  const botones = METAS.map(m => [{ text: m.nombre, callback_data: `ver_meta_${m.id}` }]);
  botones.push([{ text: '← Menú', callback_data: 'cmd_menu' }]);
  await bot.sendMessage(chatId, '🎯 *Tus 13 metas mayores:*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: botones },
  });
}

bot.onText(/\/metas/, (msg) => mostrarMetas(msg.chat.id));

// === COMANDO /avance ===

async function iniciarAvance(chatId) {
  const botones = METAS.map(m => [{ text: m.nombre, callback_data: `avance_meta_${m.id}` }]);
  botones.push([{ text: '← Cancelar', callback_data: 'cmd_menu' }]);
  userState[chatId] = { modo: 'avance_eligiendo_meta' };
  await bot.sendMessage(chatId, '✅ ¿Para cuál meta registras el avance?', {
    reply_markup: { inline_keyboard: botones },
  });
}

bot.onText(/\/avance/, (msg) => iniciarAvance(msg.chat.id));

// === COMANDO /acciones ===

async function generarAcciones(chatId) {
  await bot.sendMessage(chatId, '💪 Generando tus acciones de hoy...');
  try {
    const hoy = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaHoy = dias[hoy.getDay()];

    // Entrenamiento de hoy
    const entrenamientosHoy = {
      'Lunes': 'gym 6am',
      'Martes': 'tennis 5am, natación 8am, equitación 4:30pm',
      'Jueves': 'tennis 5am, natación 8am, equitación 4:30pm',
    };
    const entHoy = entrenamientosHoy[diaHoy] || 'sin entrenamiento programado';

    // Últimos avances
    const recientes = await getAvancesRecientes(5);
    const resumenRecientes = recientes.map(a => `- [${a.metaId}]: ${a.texto}`).join('\n') || 'Sin avances recientes.';

    const prompt = `Es ${diaHoy}. El entrenamiento de hoy fue: ${entHoy}.

Últimos avances registrados:
${resumenRecientes}

Dame 3 acciones concretas, gratuitas y realizables HOY para avanzar en las metas que más lo necesiten. Considera el día y lo que ya hice.

Formato de respuesta (solo esto, sin texto adicional):
1. [Meta]: acción específica
2. [Meta]: acción específica
3. [Meta]: acción específica`;

    const respuesta = await llamarClaude(prompt);
    await bot.sendMessage(chatId, `💪 *Tus acciones de hoy — ${diaHoy}:*\n\n${respuesta}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando acciones. Intenta de nuevo.');
    console.error(e);
  }
}

bot.onText(/\/acciones/, (msg) => generarAcciones(msg.chat.id));

// === COMANDO /super ===

async function mostrarSuper(chatId) {
  userState[chatId] = { modo: 'super' };
  try {
    const lista = await getListaSuper();
    const pendientes = lista.filter(i => !i.comprado);
    const comprados = lista.filter(i => i.comprado);

    let texto = '🛒 *Lista del súper*\n\n';
    if (pendientes.length === 0) {
      texto += '_Lista vacía_\n';
    } else {
      texto += pendientes.map(i => `☐ ${i.item}`).join('\n') + '\n';
    }
    if (comprados.length > 0) {
      texto += `\n✓ Comprados: ${comprados.map(i => i.item).join(', ')}`;
    }

    const botones = [
      [{ text: '+ Agregar item', callback_data: 'super_agregar' }],
      [{ text: '✓ Marcar comprados', callback_data: 'super_marcar' }],
      [{ text: '🍳 Generar desde receta', callback_data: 'super_receta' }],
      [{ text: '🗑 Limpiar comprados', callback_data: 'super_limpiar' }],
      [{ text: '← Menú', callback_data: 'cmd_menu' }],
    ];

    await bot.sendMessage(chatId, texto, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: botones },
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error cargando lista.');
    console.error(e);
  }
}

bot.onText(/\/super/, (msg) => mostrarSuper(msg.chat.id));

// === COMANDO /recetas ===

async function generarRecetas(chatId) {
  await bot.sendMessage(chatId, '🍳 Generando recetas...');
  try {
    const prompt = `Genera 3 recetas sanas, altas en proteína, fáciles de preparar con ingredientes disponibles en Mérida, México.

Para cada receta:
- Nombre
- Ingredientes principales (breve)
- Tiempo aproximado
- Por qué es buena para alguien que entrena intenso

Formato limpio, sin markdown excesivo. Español mexicano natural.`;

    const respuesta = await llamarClaude(prompt);
    const botones = [
      [{ text: '🛒 Agregar ingredientes al súper', callback_data: 'receta_a_super' }],
      [{ text: '← Menú', callback_data: 'cmd_menu' }],
    ];

    userState[chatId] = { modo: 'receta_lista', ultimaReceta: respuesta };
    await bot.sendMessage(chatId, `🍳 *Recetas para esta semana:*\n\n${respuesta}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: botones },
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando recetas.');
    console.error(e);
  }
}

bot.onText(/\/recetas/, (msg) => generarRecetas(msg.chat.id));

// === COMANDO /como ===

async function checkinEmocional(chatId) {
  userState[chatId] = { modo: 'como' };
  await bot.sendMessage(chatId,
    '😮‍💨 ¿Cómo estás ahorita, en serio? No tienes que poner bien. Escribe lo que es.'
  );
}

bot.onText(/\/como/, (msg) => checkinEmocional(msg.chat.id));

// === COMANDO /progreso ===

async function mostrarProgreso(chatId) {
  await bot.sendMessage(chatId, '📊 Analizando tu semana...');
  try {
    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    const [avancesSnap, entSnap, conSnap] = await Promise.all([
      db.collection('avances').where('timestamp', '>=', inicioSemana).orderBy('timestamp', 'desc').get(),
      db.collection('entrenamientos').where('timestamp', '>=', inicioSemana).get(),
      db.collection('consciencia').where('timestamp', '>=', inicioSemana).get(),
    ]);

    const avances = avancesSnap.docs.map(d => d.data());
    const entrenamientos = entSnap.docs.map(d => d.data());
    const momentos = conSnap.docs.map(d => d.data());

    const resumen = `Esta semana:
- Avances registrados: ${avances.length} (${[...new Set(avances.map(a => a.metaId))].length} metas distintas)
- Entrenamientos: ${entrenamientos.length}
- Momentos de consciencia con el celular: ${momentos.length}

Avances: ${avances.slice(0, 5).map(a => `[${a.metaId}] ${a.texto.slice(0, 60)}`).join(' | ')}`;

    const prompt = `Genera un resumen motivador pero real de la semana de Fernanda. Usa estos datos:\n\n${resumen}\n\nCierra con una frase específica y personal, no genérica.`;
    const respuesta = await llamarClaude(prompt);

    await bot.sendMessage(chatId, `📊 *Tu semana:*\n\n${respuesta}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, 'Error generando progreso.');
    console.error(e);
  }
}

bot.onText(/\/progreso/, (msg) => mostrarProgreso(msg.chat.id));

// === CALLBACK QUERIES (botones inline) ===

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

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

  // Ver detalle de una meta
  } else if (data.startsWith('ver_meta_')) {
    const metaId = data.replace('ver_meta_', '');
    const meta = METAS.find(m => m.id === metaId);
    if (!meta) return;
    const nota = await db.collection('notas_metas').doc(metaId).get();
    const textoNota = nota.exists ? nota.data().texto : 'Sin nota registrada aún.';
    await bot.sendMessage(chatId,
      `🎯 *${meta.nombre}*\n\n📍 Dónde estás hoy:\n${textoNota}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Registrar avance aquí', callback_data: `avance_meta_${metaId}` }],
            [{ text: '← Mis metas', callback_data: 'cmd_metas' }],
          ],
        },
      }
    );

  // Elegir meta para avance
  } else if (data.startsWith('avance_meta_')) {
    const metaId = data.replace('avance_meta_', '');
    const meta = METAS.find(m => m.id === metaId);
    userState[chatId] = { modo: 'avance_escribiendo', metaId, metaNombre: meta?.nombre };
    await bot.sendMessage(chatId, `✅ *${meta?.nombre}*\n\n¿Qué hiciste hoy hacia esta meta?`, { parse_mode: 'Markdown' });

  // Súper
  } else if (data === 'super_agregar') {
    userState[chatId] = { modo: 'super_agregar' };
    await bot.sendMessage(chatId, '¿Qué agregas? Escribe un item o varios separados por coma.');
  } else if (data === 'super_limpiar') {
    const lista = await getListaSuper();
    const comprados = lista.filter(i => i.comprado);
    for (const item of comprados) {
      await db.collection('lista_super').doc(item.id).delete();
    }
    await bot.sendMessage(chatId, `✓ ${comprados.length} items comprados eliminados.`);
    await mostrarSuper(chatId);
  } else if (data === 'super_marcar') {
    const lista = await getListaSuper();
    const pendientes = lista.filter(i => !i.comprado);
    if (pendientes.length === 0) {
      await bot.sendMessage(chatId, 'No hay items pendientes.');
      return;
    }
    const botones = pendientes.map(i => [{ text: `☐ ${i.item}`, callback_data: `marcar_${i.id}` }]);
    botones.push([{ text: '← Lista', callback_data: 'cmd_super' }]);
    await bot.sendMessage(chatId, 'Toca para marcar como comprado:', { reply_markup: { inline_keyboard: botones } });
  } else if (data.startsWith('marcar_')) {
    const itemId = data.replace('marcar_', '');
    await db.collection('lista_super').doc(itemId).update({ comprado: true });
    await bot.sendMessage(chatId, '✓ Marcado como comprado.');
  } else if (data === 'super_receta' || data === 'receta_a_super') {
    const estado = userState[chatId];
    const receta = estado?.ultimaReceta || '';
    if (!receta) {
      await bot.sendMessage(chatId, 'Primero genera una receta con /recetas');
      return;
    }
    const prompt = `Extrae solo la lista de ingredientes de esta receta como items del súper (una línea por item, sin cantidades exactas, sin bullet points):\n\n${receta}`;
    const ingredientes = await llamarClaude(prompt);
    const items = ingredientes.split('\n').map(i => i.trim()).filter(i => i.length > 2);
    const ts = admin.firestore.FieldValue.serverTimestamp();
    for (const item of items) {
      await db.collection('lista_super').add({ item, comprado: false, timestamp: ts });
    }
    await bot.sendMessage(chatId, `✓ ${items.length} ingredientes agregados al súper:\n${items.join(', ')}`);
  }
});

// === MENSAJES LIBRES ===

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const texto = msg.text;
  const estado = userState[chatId] || {};

  try {
    // Modo journal
    if (estado.modo === 'journal') {
      const detectados = await detectarYRegistrar(chatId, texto);
      await guardarAvance('journal', texto, 'journal');

      const responderConEmpatia = texto.toLowerCase().includes('mamá') || texto.toLowerCase().includes('mama');
      const extraCtx = responderConEmpatia
        ? 'La usuaria mencionó a su mamá. Responde con empatía real, reconoce lo que implica cuidarla, sin sonar como psicólogo.'
        : '';

      const respuesta = await llamarClaude(texto, extraCtx);

      let mensajeFinal = respuesta;
      if (detectados.length > 0) {
        mensajeFinal += `\n\n_${detectados.join(' · ')}_`;
      }
      await bot.sendMessage(chatId, mensajeFinal, { parse_mode: 'Markdown' });
      return;
    }

    // Modo avance - escribiendo texto
    if (estado.modo === 'avance_escribiendo') {
      await guardarAvance(estado.metaId, texto);
      const respuesta = await llamarClaude(
        `Fernanda acaba de registrar este avance en su meta "${estado.metaNombre}": "${texto}". Respóndele con una confirmación breve y un comentario específico que la motive a seguir.`
      );
      await bot.sendMessage(chatId, respuesta);
      userState[chatId] = null;
      await bot.sendMessage(chatId, '¿Qué más hacemos?', { reply_markup: menuKeyboard() });
      return;
    }

    // Modo check-in emocional
    if (estado.modo === 'como') {
      const esStresAlto = /agotada|estresada|mal|horrible|no puedo|cansada|frustrada/i.test(texto);
      let extraCtx = '';
      if (esStresAlto) {
        extraCtx = 'Detecta estrés alto. Responde con empatía real. Al final, sugiere sutilmente: respirar, caminar, o escribirle más al bot en lugar de abrir redes sociales. Sin ser condescendiente.';
      }
      const respuesta = await llamarClaude(texto, extraCtx);
      await db.collection('consciencia').add({
        texto,
        tipo: 'checkin_emocional',
        fecha: new Date().toLocaleDateString('es-MX'),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await bot.sendMessage(chatId, respuesta);
      userState[chatId] = null;
      return;
    }

    // Modo agregar al súper
    if (estado.modo === 'super_agregar') {
      const items = texto.split(',').map(i => i.trim()).filter(i => i.length > 0);
      const ts = admin.firestore.FieldValue.serverTimestamp();
      for (const item of items) {
        await db.collection('lista_super').add({ item, comprado: false, timestamp: ts });
      }
      await bot.sendMessage(chatId, `✓ Agregado: ${items.join(', ')}`);
      userState[chatId] = null;
      await mostrarSuper(chatId);
      return;
    }

    // Mensaje libre (sin modo activo) — responde como life coach
    const recientes = await getAvancesRecientes(5);
    const contexto = recientes.length > 0
      ? `Últimas entradas de Fernanda: ${recientes.map(a => a.texto.slice(0, 80)).join(' | ')}`
      : '';
    const respuesta = await llamarClaude(texto, contexto);
    await bot.sendMessage(chatId, respuesta);

  } catch (e) {
    console.error('Error procesando mensaje:', e);
    await bot.sendMessage(chatId, 'Algo salió mal. Intenta de nuevo.');
  }
});

// === MENSAJES AUTOMÁTICOS CON CRON ===

if (FERNANDA_CHAT_ID) {
  // 8:50am lunes a viernes
  cron.schedule('50 8 * * 1-5', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Buenos días Fer ☀️ Ya entrenaste, ya eres mejor que ayer.\n\n¿En qué vas a trabajar esta mañana?'
      );
    } catch (e) { console.error('Cron 8:50am error:', e); }
  }, { timezone: 'America/Merida' });

  // 10:25am diario
  cron.schedule('25 10 * * 1-5', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'En 5 minutos termina tu bloque de trabajo profundo.\n\n¿Qué lograste esta mañana?'
      );
    } catch (e) { console.error('Cron 10:25am error:', e); }
  }, { timezone: 'America/Merida' });

  // 12:55pm diario
  cron.schedule('55 12 * * 1-5', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Hora de cerrar la mañana.\n\n¿Qué fue lo más importante que hiciste hoy?'
      );
    } catch (e) { console.error('Cron 12:55pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 9:00pm diario
  cron.schedule('0 21 * * *', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Antes de dormir — ¿cómo estuvo tu día? ¿Agarraste el cel sin razón hoy?'
      );
    } catch (e) { console.error('Cron 9pm error:', e); }
  }, { timezone: 'America/Merida' });

  // Domingo 7:00pm
  cron.schedule('0 19 * * 0', async () => {
    try {
      await bot.sendMessage(FERNANDA_CHAT_ID,
        'Es domingo Fer. Escribe /progreso para ver cómo vas esta semana. 📊'
      );
    } catch (e) { console.error('Cron domingo error:', e); }
  }, { timezone: 'America/Merida' });

  console.log('✓ Mensajes automáticos activados para Chat ID:', FERNANDA_CHAT_ID);
} else {
  console.log('⚠️  FERNANDA_CHAT_ID no configurado — mensajes automáticos desactivados. Envía /start al bot para obtener tu Chat ID.');
}

// === INICIO ===
console.log('🤖 Bot Semana Perfecta iniciado');
bot.on('polling_error', (error) => console.error('Polling error:', error.code));
