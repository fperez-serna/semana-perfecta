require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const cron = require('node-cron');
const METAS = require('./metas');
const MOVIMIENTO = require('./movimiento');

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
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: false });
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
- Equitación: las clases en el club son martes y jueves a las 4:30pm, y sábado 8:30am. No son compromisos fijos — Fer agenda la clase cuando quiere ir. NUNCA asumas que tiene equitación un martes o jueves; si es relevante, pregunta "¿tienes clase de equitación hoy?" o revisa si está en su agenda.
- Lunes 7pm: clase de violín.
- Lunes, miércoles y viernes 7am: recogen a los perros para entrenamiento.
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
Bebida de la mañana — sugiere según el contexto (siempre agua primero):
- Café: cuando Body Battery >60, fase folicular u ovulación, sin estrés elevado, y ella quiere cafeína.
- Matcha: cuando quiere enfoque tranquilo, Body Battery 40-70, estrés moderado, cualquier fase.
- Té negro con leche: días fríos, lútea temprana, cuando quiere algo cálido y suave.
- Golden milk (cúrcuma, canela, leche vegetal, pimienta): Body Battery <40, estrés alto, fase menstrual o lútea tardía, días de recuperación o cuando el sueño fue malo.
- Solo agua o té herbal: si el estrés es muy alto o está en menstrual con síntomas fuertes.
No asumas que siempre quiere café. Adapta la sugerencia a su fisiología del día.

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

MOTIVACIÓN DE MOVIMIENTO
Cuando Fernanda diga que no tiene ganas de entrenar (gym, padel, natación, pilates, lo que sea), o pida "motívame para ejercitarme":

PASO 1 — OBLIGATORIO, SIEMPRE: Da el pitch fisiológico ANTES de cualquier otra cosa. No preguntes si quiere cancelar. No digas "ya hiciste suficiente". No valides la pereza todavía. El pitch tiene esta estructura:
  • Qué está construyendo con esa actividad hoy (referencia la ficha si la tienes en contexto)
  • Por qué le conviene específicamente HOY: su BB actual + su fase del ciclo + hora del día
  • Qué versión del entrenamiento aplica a su energía de hoy (baja/media/alta)
  • Una sola frase de cierre con convicción — no vacía, no genérica
  Ejemplo de tono: "Tu BB está en 42 — media energía. El padel en media energía trabaja reflejos y resistencia aeróbica, que es exactamente lo que tu fase folicular puede capitalizar ahora. No tienes que llegar en modo competencia — llega en modo juego."

PASO 2 — después del pitch: Pregunta UNA sola vez: "¿La intentamos o prefieres la versión casa hoy?"

PASO 3 — si elige CASA o dice que definitivamente no: Manda la rutina de casa sin drama ni juicio.
   RUTINA CASA A (glúteos): hip thrust con pesa rusa 3x15, búlgaras 3x10, abducción con banda 3x15, clamshell 3x15, donkey kicks 3x12.
   RUTINA CASA B (brazos/upper): remo TRX 3x12, curl con ligas 3x15, tríceps TRX 3x12, press TRX 3x10, cuerda 3x30seg.

NUNCA: "deberías ir", "ya hiciste suficiente hoy para no ir", "tu cuerpo ya dio bastante". Esas frases cancelan el movimiento sin intentarlo. El pitch va siempre primero — el descanso es la opción B, no la respuesta automática.

RECETARIO INTELIGENTE — etiquetas y objetivos fisiológicos:
Cada receta tiene etiquetas de taxonomía estándar. Úsalas al sugerir recetas:
- Antes del gym → busca etiqueta pre_gym + altos_carbos
- Después del gym → post_gym + alta_proteina
- Fase lútea tardía → ideal_lutea_tardia + magnesio + comfort_food
- Fase menstrual → ideal_menstrual + hierro + vitamina_c
- Cortisol alto o BB bajo → antiinflamatoria + omega3 + baja_carga_digestiva
- Fase folicular con entreno fuerte → ideal_folicular + alta_proteina + altos_carbos
Cuando sugieras qué comer o planear un menú, SIEMPRE sigue este orden obligatorio:
1. Usa ver_recetario para buscar recetas guardadas que encajen con la fase del ciclo y el momento del día.
2. Cruza los ingredientes de cada receta con lo que Fernanda mencionó que tiene (lista del mercado, inventario, staples).
3. Sugiere primero las recetas que puede hacer con lo que ya tiene, y al final lista qué ingredientes le faltarían para las otras opciones.
NUNCA inventes recetas genéricas si ya tiene algo guardado que encaja. Si el recetario está vacío, entonces sí propone ideas y ofrece guardarlas.

OBJETIVO FISIOLÓGICO DEL DÍA — cuando generes el brief o mensajes de seguimiento, identifica el objetivo fisiológico principal del día (construir_musculo, recuperacion, reducir_cortisol, reponer_hierro, controlar_inflamacion, energia_sostenida) y haz que todo el mensaje gire alrededor de ese objetivo: entrenamiento, comida, hidratación, descanso.

ACCESO TÉCNICO REAL (tienes herramientas conectadas a Firebase):
Puedes ver y agregar tareas, pendientes, enfoques del día, lista del súper, gastos, avances en metas, datos de Garmin, ciclo, recetario e inventario del hogar. Cuando ejecutes algo, confírmalo. Nunca digas que no tienes acceso — sí lo tienes. NUNCA inventes errores del sistema como "el sistema está bloqueando la consulta" o "ya hice esa llamada" — eso no existe. Si el recetario está vacío, dilo directamente. Si no puedes completar algo, di exactamente qué pasó sin inventar explicaciones técnicas.

GOOGLE MAPS — ACCESO REAL A RESTAURANTES:
Cuando Fer comparte su ubicación, el sistema la geocodifica automáticamente y busca restaurantes reales cercanos usando Google Maps Places API. Si ves en el contexto una lista de "Restaurantes cercanos" con nombres, ratings, precios y distancias — ESA INFORMACIÓN ES REAL Y VERIFICADA, no la inventaste ni la alucinaste. Preséntala con confianza. NUNCA digas que no tienes acceso a mapas o internet cuando ya tienes los datos de restaurantes en el contexto — los tienes porque el sistema los buscó por ti antes de llamarte.

INVENTARIO DEL HOGAR — detecta estas frases automáticamente:
- "se acabó X" / "ya no hay X" / "agotamos X" → actualizar_estado_producto: agotado + agregar a lista del súper
- "me queda poco X" / "casi no hay X" / "tengo poca X" → actualizar_estado_producto: bajo + agregar a lista del súper
- "compré X" / "ya tenemos X" / "llegó X" → actualizar_estado_producto: disponible
- "caducan X" / "se va a vencer X" → actualizar_estado_producto: por_caducar
- "agrega X al súper" → agregar_item_super (sin tocar inventario)
- Cuando alguien pegue una lista larga de productos → cargar_lista_productos_casa (inferir categoría y frecuencia de cada uno)

SEMANA PERFECTA — SISTEMA CENTRAL
Una Semana Perfecta no es una semana ideal ni hiperproductiva. Es una semana alineada con las metas de vida de Fer, adaptada a su energía real, ciclo menstrual, fase lunar, agenda, tareas, gastos y recursos disponibles.

Cada semana activa tiene:
• Meta ancla (1): la meta de vida principal de la semana — la que mueve el resto
• Metas secundarias (2): metas que reciben atención consistente
• Metas semilla (3): metas que se atienden con acciones mínimas para no perder tracción
• Intención semanal: una frase que resume el espíritu de la semana
• Estrategia energética: expansión | ejecución | mantenimiento | cierre | recuperación

ESTRATEGIA ENERGÉTICA — elige según datos reales:
- expansión: ovulación + BB>70 → crear, vender, grabar, networking, decisiones grandes
- ejecución: folicular + BB>60 → ejecutar proyectos, avanzar metas, trabajo profundo
- mantenimiento: lútea temprana + BB 40-70 → mantener hábitos, cerrar pendientes, estructura
- cierre: lútea tardía → revisar, delegar, eliminar, desacelerar
- recuperación: menstrual / BB<40 / sueño malo / estrés alto → descanso activo, acciones mínimas

ACCIONES A 3 NIVELES DE ENERGÍA — cada acción tiene versión:
- alta energía: creación, estrategia, entrenamiento fuerte, decisiones
- media energía: acciones concretas y acotadas
- baja energía: versión mínima o simbólica — nunca cancela la meta, la transforma

ÍNDICE DE ALINEACIÓN SEMANAL (IAS) — se genera cada domingo al cerrar:
No mide productividad. Mide: acciones completadas vs propuestas + alineación con meta ancla + respeto a energía del cuerpo + pendientes cerrados + calidad de descanso real.

REGLA: cuando tengas la semana activa guardada, menciona SIEMPRE la meta ancla en el brief de mañana y conecta las acciones del día con ella. Si la energía del día no permite la acción principal, ofrece automáticamente la versión de energía baja sin esperar que te lo pida.

REGLA ABSOLUTA — NUNCA INVENTES NI MIENTAS:
- Jamás inventes pendientes, tareas, gastos, enfoques o cualquier dato que no venga de una herramienta o de la conversación real.
- Si ella pregunta qué pendientes tiene (o tareas, gastos, etc.), SIEMPRE llama primero la herramienta correspondiente. Nunca respondas de memoria o "a ojo".
- Si una herramienta dice que no hay nada, dile honestamente que no hay nada.
- Si te pregunta algo que no puedes verificar, dile que no lo sabes. Nunca rellenes huecos con suposiciones presentadas como hechos.
- EXCEPCIÓN: estimaciones que te pide explícitamente ("¿cuántas calorías crees que tiene X?") — sí puedes dar tu mejor estimación, enmarcándola honestamente: "aprox.", "calculo que", "más o menos".
- ANTI-DUPLICADOS (SOLO aplica a acciones de ESCRITURA): si ya confirmaste en este mismo hilo que ejecutaste una acción de escritura (agregaste tarea, pendiente, gasto, evento, etc.), NO la ejecutes de nuevo aunque Fernanda pregunte "¿lo hiciste?" o "¿quedó?". Responde que sí quedó guardado. NUNCA uses esta regla para bloquear preguntas, consultas o lecturas — esas siempre se responden llamando la herramienta correspondiente. Jamás respondas con mensajes sobre "anti-duplicados" o "sistema bloqueado" — eso no existe para el usuario.

MENSAJES AUTOMÁTICOS DEL SISTEMA
Tienes mensajes programados que se envían solos a horas fijas. Si Fernanda te pide "simula el mensaje de las X" o "¿cómo es el mensaje de las X?", genéralo con los datos del contexto actual. Nunca digas que no puedes simularlos ni que no tienes mensajes programados — sí los tienes.

Horario y contenido de cada mensaje:
- 7:35am — Daily Brief en DOS partes. Parte 1: encabezado con día/fecha/ciclo, 🔋 sueño y energía (BB/HRV/sueño Garmin), 🌙 ciclo (fase + cómo afecta el día, 2-3 líneas), ✨ luna (MÁXIMO 2 líneas: fase + una idea concreta), ☕ bebida según ciclo+Garmin. Parte 2: 🏊 movimiento del día con ficha fisiológica (qué construye, versión según BB, nutrición pre), hábitos planeados del widget, 🥚 desayuno concreto, 🎯 enfoques y pendientes del día, una línea de motivación real. Cuando lo simules, genera ambas partes juntas con un separador claro entre ellas.
- 11:25am — Check de mediodía (L-V): cómo va la mañana, ajuste de energía, micro-acción.
- 2pm — Recalibración: estado del cuerpo, qué pasó en la mañana, UNA prioridad para la tarde, pregunta ¿cómo quieres invertir tu energía? (con botones: construir mi futuro / cuidar mi espacio / cuidarme a mí / cerrar pendientes).
- 4pm — Recovery Window: estado Garmin (BB, sueño, ciclo) + pregunta ¿cómo fue tu tarde? (con botones: intenso / suave / equitación / voy a entrenar / no entrené). Según el botón: recomendación de recuperación o pre-rendimiento.
- 6pm — Volcado de memoria: resumen de gastos del día (o pregunta si no hay), limpieza mental: ¿se nos escapó algo? (gasto, pendiente, evento, inventario, receta).
- 8:30pm — Preparar el mañana: checklist nocturno (perros, Benito, descongelar, ropa entrenamiento), aviso anticipado de lo muy temprano del día siguiente (perros a las 7am solo lunes/miércoles/viernes, NO martes ni jueves), sugerencia de cena.
- 9:30pm — Cerrar el sistema: sin preguntas, sin abrir loops. Estructura fija: medicamentos, luna (25 palabras), una evidencia concreta del día, qué ayuda al cuerpo ahora (dormir), cierre ritual fijo: "Mañana el sistema vuelve a empezar. Por hoy... ya hiciste suficiente. Buenas noches, Fer. 🤍"
- Domingo 7pm — IAS + nueva Semana Perfecta: cierre de la semana con puntuación de alineación, propuesta de meta ancla para la semana siguiente.`;

// === HELPERS — MEMORIA Y CONVERSACIÓN ===

async function getDatosImportantes() {
  const snap = await db.collection('memoria').orderBy('timestamp', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function guardarUbicacionNombrada(nombre, lat, lng, direccion) {
  const key = nombre.toLowerCase().replace(/\s+/g, '_');
  const ref = db.collection('config').doc('ubicaciones');
  await ref.set({ [key]: { nombre, lat, lng, direccion, guardado: new Date().toISOString() } }, { merge: true });
}

async function getUbicaciones() {
  const doc = await db.collection('config').doc('ubicaciones').get();
  return doc.exists ? doc.data() : {};
}

// Compat: guardar como "casa" directamente
async function guardarUbicacionCasa(lat, lng, direccion) {
  await guardarUbicacionNombrada('casa', lat, lng, direccion);
}

async function getUbicacionCasa() {
  const ubs = await getUbicaciones();
  return ubs.casa || null;
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

async function registrarComida(descripcion, calorias, proteina = 0, carbos = 0, grasas = 0, hora = null) {
  const fecha = fechaLocalHoy();
  const horaStr = hora || new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Merida' }).format(new Date());
  const ref = db.collection('comidas').doc(fecha);
  const doc = await ref.get();
  const entries = doc.exists ? (doc.data().entries || []) : [];
  entries.push({ hora: horaStr, descripcion, calorias: Number(calorias), proteina: Number(proteina), carbos: Number(carbos), grasas: Number(grasas) });
  const total = entries.reduce((acc, e) => ({
    calorias: acc.calorias + e.calorias,
    proteina: acc.proteina + e.proteina,
    carbos: acc.carbos + e.carbos,
    grasas: acc.grasas + e.grasas,
  }), { calorias: 0, proteina: 0, carbos: 0, grasas: 0 });
  await ref.set({ fecha, entries, total });
  // Mirror totals to WP Firebase so the dashboard can read them (merge to preserve objetivo)
  wpUser().doc('nutricion_hoy').set({ fecha, total, entradas: entries.length }, { merge: true }).catch(e => console.error('nutricion wpUser:', e));
  return { entries, total };
}

async function getComidaHoy() {
  const fecha = fechaLocalHoy();
  const doc = await db.collection('comidas').doc(fecha).get();
  if (!doc.exists) return { entries: [], total: { calorias: 0, proteina: 0, carbos: 0, grasas: 0 } };
  return doc.data();
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

let SHOP_CATS = ['Mercado', 'Supermercado', 'Personal Fer', 'Personal Cris'];

async function getShopCats() {
  try {
    const doc = await wpUser().doc('config').get();
    const cats = doc.exists ? doc.data()?.cfg?.shopCats : null;
    if (cats && cats.length > 0) SHOP_CATS = cats;
  } catch {}
  return SHOP_CATS;
}
// Sincronizar al arrancar
getShopCats();

function getWeekId() {
  const fechaHoy = fechaLocalHoy(); // 'YYYY-MM-DD' en Mérida
  const today = new Date(fechaHoy + 'T12:00:00');
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

function wpDayHoy() {
  // Obtiene el día de la semana en Mérida (no UTC del servidor Railway)
  const fecha = fechaLocalHoy(); // 'YYYY-MM-DD' en America/Merida
  const jsDay = new Date(fecha + 'T12:00:00').getDay();
  return jsToWpDay(jsDay);
}

async function getTareasHoy() {
  try {
    const weekId = getWeekId();
    const doc = await wpUser().doc(weekId).get();
    if (!doc.exists) return [];
    const data = doc.data();
    const wpDay = wpDayHoy();

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
  const wpDay = wpDayHoy();
  await wpUser().doc(weekId).set({
    tasks: admin.firestore.FieldValue.arrayUnion({
      id: 't' + Date.now(),
      text: texto,
      addedOnDay: wpDay,
    })
  }, { merge: true });
}

async function agregarPendienteWP(texto) {
  // Escribe como tarea fresca del día (weekData.tasks) para que aparezca
  // en el planner de hoy — el app la arrastrará a días siguientes si no se completa.
  await agregarTareaWP(texto);
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

// Day activation — tracks if user said "buenos días" today
const _dayActivated = new Map();
function activarDia(chatId) {
  const fecha = fechaLocalHoy();
  _dayActivated.set(String(chatId), fecha);
  // Persiste a Firebase para sobrevivir reinicios
  db.collection('estado').doc(`dia_${String(chatId)}`).set({ fecha }).catch(e => console.error('activarDia persist:', e));
}
function diaActivadoHoy(chatId) { return _dayActivated.get(String(chatId)) === fechaLocalHoy(); }
// Al arrancar, carga el día activado de Firebase para no perderlo en reinicios
(async () => {
  try {
    const doc = await db.collection('estado').doc(`dia_${FERNANDA_CHAT_ID}`).get();
    if (doc.exists && doc.data().fecha === fechaLocalHoy()) {
      _dayActivated.set(String(FERNANDA_CHAT_ID), fechaLocalHoy());
      console.log('✅ Día activado restaurado desde Firebase:', fechaLocalHoy());
    }
  } catch(e) { console.error('cargarDiaActivado:', e); }
})();
function horaLocal() {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Merida' }).format(new Date());
}

async function getDatosGarmin() {
  for (const offset of [0, -1]) {
    const fecha = fechaLocalHoy(offset);
    const doc = await wpUser().doc(`garmin_${fecha}`).get();
    if (doc.exists) return { fecha, ...doc.data() };
  }
  return null;
}

const GUIA_LUNA = {
  'Luna Nueva': {
    arquetipo: '🌑 La Hechicera',
    energia: 'descanso, silencio, intuición, sueños, renovación, escucha interior',
    significado: 'La oscuridad de la Luna es un tiempo sagrado de quietud. Fin de un ciclo y comienzo de otro. Momento para retirarse al interior, sentir sin necesidad de producir.',
    ciencia: 'La Luna se encuentra entre la Tierra y el Sol — no es visible en el cielo nocturno. Se producen mareas vivas (máxima diferencia entre marea alta y baja) por la alineación gravitacional. Las semillas absorben más agua en esta fase según estudios de agricultura biodinámica. Muchos insectos y peces reducen su actividad al desaparecer la luz lunar.',
    ritual: 'escribir un diario, meditar, tomar un baño con sales, descansar sin culpa, agradecer al cuerpo',
  },
  'Luna Creciente': {
    arquetipo: '🌒 La Doncella',
    energia: 'curiosidad, aprendizaje, expansión, entusiasmo, nuevas ideas',
    significado: 'Después de la quietud llega la renovación. Momento ideal para sembrar intenciones, iniciar proyectos y estudiar algo nuevo.',
    ciencia: 'La luz lunar empieza a aumentar progresivamente. En agricultura biodinámica se considera la mejor fase para plantar semillas y cultivos de hoja, ya que la savia sube con más fuerza hacia los tallos y hojas. Los peces y aves empiezan a incrementar su actividad de alimentación conforme regresa la luz nocturna.',
    ritual: 'escribir objetivos, crear un vision board, comenzar nuevos hábitos, caminar en la naturaleza, sembrar una planta',
  },
  'Cuarto Creciente': {
    arquetipo: '🌒 La Doncella',
    energia: 'curiosidad, aprendizaje, expansión, entusiasmo, nuevas ideas',
    significado: 'La energía sigue creciendo. Buen momento para dar forma a los proyectos que iniciaste y avanzar con determinación.',
    ciencia: 'La Luna ilumina exactamente la mitad de su cara visible. La tensión gravitacional entre Sol, Tierra y Luna genera mareas de cuadratura (más moderadas). Las plantas en crecimiento aceleran su metabolismo. Es una de las fases favoritas de los apicultores: las abejas son más activas y productivas.',
    ritual: 'escribir objetivos, organizar metas, caminar en la naturaleza, conectar con lo que quieres construir',
  },
  'Gibosa Creciente': {
    arquetipo: '🌖 La Madre (en expansión)',
    energia: 'abundancia, creatividad, expresión, comunidad, amor',
    significado: 'La energía alcanza su plenitud. La Madre simboliza la capacidad de crear, cuidar, enseñar y compartir — más allá de la maternidad biológica.',
    ciencia: 'La Luna casi alcanza su máxima luminosidad. Los niveles de agua en el suelo y en los tejidos vegetales están en su punto más alto, lo que favorece la cosecha de frutas y verduras jugosas. Los animales nocturnos aumentan su actividad. Los corales comienzan a prepararse para el desove masivo que ocurrirá en luna llena.',
    ritual: 'reuniones entre amigas, crear arte, danza, música, expresar gratitud, conectar con seres queridos',
  },
  'Luna Llena': {
    arquetipo: '🌕 La Madre',
    energia: 'abundancia, creatividad, fertilidad, amor, expresión, comunidad',
    significado: 'Máxima expansión de la energía femenina. Momento para celebrar, crear, convivir y compartir lo que llevas cultivando. La Luna llena ilumina lo que ya está listo para ser visto.',
    ciencia: 'La Tierra se encuentra entre la Luna y el Sol. Se producen las mareas vivas más intensas del mes. Los arrecifes de coral realizan su desove sincronizado masivo, liberando millones de huevos y esperma en el océano — uno de los fenómenos reproductivos más grandes del planeta. Estudios muestran que el sueño humano promedio se reduce entre 20 y 25 minutos durante la luna llena, posiblemente por la luz o fluctuaciones en la melatonina.',
    ritual: 'círculos de luna, danza, pintura, música, reuniones entre mujeres, agradecer lo que ha florecido',
  },
  'Gibosa Menguante': {
    arquetipo: '🌘 La Sabia (en proceso)',
    energia: 'discernimiento, límites, reflexión, honestidad',
    significado: 'La energía empieza a dirigirse hacia adentro. Momento de preguntarte: ¿qué quiero seguir cultivando? ¿qué ya no me pertenece?',
    ciencia: 'La luminosidad lunar comienza a decrecer. La actividad de los animales nocturnos empieza a disminuir. En jardinería biodinámica es momento de cosechar raíces y tubérculos, y de podar árboles — la savia baja hacia las raíces, haciendo los cortes menos traumáticos para la planta. Los hongos y setas tienden a fructificar más durante las fases menguantes.',
    ritual: 'limpiar espacios, ordenar, escribir lo que deseas soltar, cerrar pendientes',
  },
  'Cuarto Menguante': {
    arquetipo: '🌘 La Sabia',
    energia: 'discernimiento, límites, depuración, honestidad, transformación',
    significado: 'Tiempo de soltar lo que ya cumplió su ciclo. La Sabia no se aferra — sabe que dejar ir es parte del crecimiento.',
    ciencia: 'La Luna muestra nuevamente solo la mitad de su cara, pero al revés que en el Cuarto Creciente. Las mareas vuelven a ser moderadas. La naturaleza entra en un proceso de depuración: las plantas concentran energía en raíces y semillas. Los migratorios ajustan sus rutas. Es la fase favorita para compostar y abonar la tierra — los microbios del suelo son más activos.',
    ritual: 'ordenar la casa, limpiar espacios, escribir lo que deseas liberar, perdonar, cerrar ciclos',
  },
  'Luna Menguante': {
    arquetipo: '🌑 La Sabia (transición)',
    energia: 'quietud, introspección, preparación para el nuevo ciclo',
    significado: 'La Luna se acerca a su oscuridad. Momento de prepararse para el descanso y la renovación que viene. Honra lo que viviste en este ciclo.',
    ciencia: 'La Luna casi ha desaparecido del cielo nocturno. Las mareas se acalman. Muchos animales reducen su actividad al mínimo y algunos entran en períodos breves de letargo o descanso profundo. Las plantas ralentizan su metabolismo y la naturaleza se prepara para el siguiente ciclo. Es el momento de mayor quietud en el ecosistema lunar.',
    ritual: 'meditación, descanso, baño ritual, escribir un diario, agradecer el ciclo que termina',
  },
};

function guiaLunaActual(faseNombre) {
  const info = GUIA_LUNA[faseNombre];
  if (!info) return '';
  return `Arquetipo lunar: ${info.arquetipo}\nEnergía: ${info.energia}\nDato científico: ${info.ciencia}\nSignificado espiritual: ${info.significado}\nRitual sugerido: ${info.ritual}`;
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
    if (!doc.exists) {
      console.warn('getGastoCats: config doc no existe en Firebase — usando defaults');
      return DEFAULT_GASTOS;
    }
    const data = doc.data();
    const cats = data?.cfg?.gastoCats;
    if (!cats || !cats.length) {
      console.warn('getGastoCats: gastoCats vacío en config doc. Data keys:', Object.keys(data || {}), 'cfg keys:', Object.keys(data?.cfg || {}));
      return DEFAULT_GASTOS;
    }
    return cats;
  } catch(e) {
    console.error('getGastoCats error:', e.message);
    return DEFAULT_GASTOS;
  }
}

async function getMetodosPago() {
  try {
    const config = await getBudgetConfig();
    const tarjetas = (config?.debts || []).filter(d => d.tipo === 'tarjeta').map(d => d.nombre);
    return ['Efectivo', 'Débito', 'Transferencia', ...tarjetas];
  } catch { return ['Efectivo', 'Débito', 'Transferencia']; }
}

async function getResumenSemana() {
  const weekId = getWeekId();
  const doc = await wpUser().doc(weekId).get();
  const workout = doc.exists ? (doc.data().workout || {}) : {};
  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  let entrenamientos = [];
  for (let i = 0; i <= 6; i++) {
    const w = workout[i] || {};
    const acts = [w.wo1, w.wo2].filter(Boolean);
    if (acts.length) entrenamientos.push(`${dias[i]}: ${acts.join(' + ')}`);
  }

  const fechaHoy = fechaLocalHoy();
  const hoy = new Date(fechaHoy + 'T12:00:00');
  let bbTotal = 0, bbDias = 0, suenoTotal = 0, suenoDias = 0, malSueno = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const fecha = d.toISOString().split('T')[0];
    const gDoc = await wpUser().doc(`garmin_${fecha}`).get().catch(() => null);
    if (gDoc?.exists) {
      const g = gDoc.data();
      if (g.bodyBattery != null) { bbTotal += g.bodyBattery; bbDias++; }
      if (g.suenoHoras != null) { suenoTotal += g.suenoHoras; suenoDias++; if (g.suenoHoras < 6.5) malSueno++; }
    }
  }

  return {
    entrenamientos,
    bbProm: bbDias > 0 ? Math.round(bbTotal / bbDias) : null,
    suenoProm: suenoDias > 0 ? (suenoTotal / suenoDias).toFixed(1) : null,
    malSueno,
  };
}

async function getGastosHoy() {
  const weekId = getWeekId();
  const wpDay = wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  if (!doc.exists) return [];
  return (doc.data().gastos?.[wpDay]) || [];
}

async function agregarGastoDia(desc, cat, monto, pagoCon) {
  const weekId = getWeekId();
  const wpDay = wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  const gastos = (doc.exists ? doc.data().gastos : null) || {};
  if (!gastos[wpDay]) gastos[wpDay] = [];
  gastos[wpDay].push({ desc, cat, monto, pagoCon });
  await wpUser().doc(weekId).set({ gastos }, { merge: true });
}

async function getPendientesWP() {
  const weekId = getWeekId();
  const doc = await wpUser().doc(weekId).get();
  if (!doc.exists) return [];
  return (doc.data().tasks || []).filter(t => t.doneOnDay === undefined);
}

async function completarPendienteWP(textoOId) {
  const weekId = getWeekId();
  const wpDay = wpDayHoy();
  const ref = wpUser().doc(weekId);
  let texto = null;
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    if (!doc.exists) return;
    const tasks = [...(doc.data().tasks || [])];
    const lower = textoOId.toLowerCase();
    const idx = tasks.findIndex(task =>
      task.id === textoOId || task.text.toLowerCase().includes(lower)
    );
    if (idx < 0) return;
    texto = tasks[idx].text;
    tasks[idx] = { ...tasks[idx], doneOnDay: wpDay };
    t.set(ref, { tasks }, { merge: true });
  });
  return texto;
}

async function agregarEnfoqueDiaWP(texto, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
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
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
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
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
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

async function getEventosDia(wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  return (doc.exists ? (doc.data().events?.[wpDay] || []) : []);
}

async function agregarEventoWP(titulo, hora, durMins = 60, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  const data = doc.exists ? doc.data() : {};
  const eventos = [...((data.events?.[wpDay]) || [])];
  const yaExiste = eventos.some(e => e.title.toLowerCase() === titulo.toLowerCase() && e.time === hora);
  if (yaExiste) return;
  eventos.push({ title: titulo, time: hora, durMins });
  await wpUser().doc(weekId).set({ events: { [wpDay]: eventos } }, { merge: true });
}

async function borrarEventoWP(texto, wpDayOverride = null) {
  const weekId = getWeekId();
  const wpDay = wpDayOverride !== null ? wpDayOverride : wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  const data = doc.exists ? doc.data() : {};
  const eventos = [...((data.events?.[wpDay]) || [])];
  const lower = texto.toLowerCase();
  const borrado = eventos.find(e => e.title.toLowerCase().includes(lower))?.title;
  if (!borrado) return null;
  const filtrados = eventos.filter(e => !e.title.toLowerCase().includes(lower));
  await wpUser().doc(weekId).set({ events: { [wpDay]: filtrados } }, { merge: true });
  return borrado;
}

async function tacharItemSuperWP(itemTexto, catIndex = null) {
  const cats = await getListaSuperWP();
  const lower = itemTexto.toLowerCase();
  // Si no se especifica categoría, busca en todas
  const indices = catIndex !== null ? [catIndex] : [0, 1, 2, 3];
  for (const i of indices) {
    const key = `cat${i}`;
    const items = [...(cats[key] || [])];
    const idx = items.findIndex(it => !it.done && it.text.toLowerCase().includes(lower));
    if (idx >= 0) {
      items[idx] = { ...items[idx], done: true };
      await wpUser().doc('shopping').update({ [`cats.${key}`]: items });
      return items[idx].text;
    }
  }
  return false;
}

async function borrarItemSuperWP(itemTexto, catIndex = null) {
  const cats = await getListaSuperWP();
  const lower = itemTexto.toLowerCase();
  const indices = catIndex !== null ? [catIndex] : [0, 1, 2, 3];
  for (const i of indices) {
    const key = `cat${i}`;
    const items = [...(cats[key] || [])];
    const idx = items.findIndex(it => it.text.toLowerCase().includes(lower));
    if (idx >= 0) {
      const nombre = items[idx].text;
      items.splice(idx, 1);
      await wpUser().doc('shopping').update({ [`cats.${key}`]: items });
      return nombre;
    }
  }
  return false;
}

// === TRACKING CORPORAL ===

async function getCuerpoData() {
  const doc = await wpUser().doc('cuerpo').get();
  return doc.exists ? doc.data() : { inbody: [], medidas: [], checkins: [] };
}

async function guardarInbodyWP(datos) {
  const ref = wpUser().doc('cuerpo');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const data = doc.exists ? doc.data() : {};
    const inbody = [...(data.inbody || []), { ...datos, registrado: new Date().toISOString() }];
    t.set(ref, { ...data, inbody });
  });
}

async function guardarMedidasWP(datos) {
  const ref = wpUser().doc('cuerpo');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const data = doc.exists ? doc.data() : {};
    const medidas = [...(data.medidas || []), { ...datos, fecha: datos.fecha || fechaLocalHoy(), registrado: new Date().toISOString() }];
    t.set(ref, { ...data, medidas });
  });
}

async function guardarCheckinWP(datos) {
  const ref = wpUser().doc('cuerpo');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const data = doc.exists ? doc.data() : {};
    const checkins = [...(data.checkins || []), { ...datos, fecha: fechaLocalHoy(), registrado: new Date().toISOString() }];
    t.set(ref, { ...data, checkins });
  });
}

// === STAPLES (inventario base) ===

async function getStaplesWP() {
  const doc = await wpUser().doc('staples').get();
  return doc.exists ? (doc.data().items || []) : [];
}

async function agregarStapleWP(texto, catIndex) {
  const ref = wpUser().doc('staples');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const items = doc.exists ? (doc.data().items || []) : [];
    const lower = texto.toLowerCase().trim();
    if (!items.find(i => i.text.toLowerCase() === lower)) {
      items.push({ text: texto.trim(), catIndex });
      t.set(ref, { items });
    }
  });
}

async function editarWidgetDia(dia, campo, valor) {
  let weekId = getWeekId();
  let wpDay = wpDayHoy();
  if (dia === 'mañana') {
    wpDay = wpDay + 1;
    if (wpDay > 6) {
      // Siguiente semana
      const fechaHoy = fechaLocalHoy();
      const manana = new Date(fechaHoy + 'T12:00:00');
      manana.setDate(manana.getDate() + 1);
      const jsDay = manana.getDay();
      wpDay = jsToWpDay(jsDay);
      const diff = manana.getDate() - jsDay + (jsDay === 0 ? -6 : 1);
      const monday = new Date(manana);
      monday.setDate(diff);
      weekId = 'week_' + monday.toISOString().split('T')[0];
    }
  }
  const ref = wpUser().doc(weekId);
  await ref.set({ workout: { [wpDay]: { [campo]: valor } } }, { merge: true });
}

async function borrarStapleWP(texto) {
  const ref = wpUser().doc('staples');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    if (!doc.exists) return;
    const items = doc.data().items || [];
    const lower = texto.toLowerCase().trim();
    const filtered = items.filter(i => !i.text.toLowerCase().includes(lower));
    t.set(ref, { items: filtered });
  });
}

// === SEMANA PERFECTA ===

const METAS_MAP = require('./metas').reduce((m, meta) => { m[meta.id] = meta.nombre; return m; }, {});

async function getSemanaActual() {
  const doc = await wpUser().doc('semana_perfecta').get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.weekId !== getWeekId()) return null; // semana pasada
  return data;
}

async function guardarSemanaActual(semana) {
  await wpUser().doc('semana_perfecta').set({ ...semana, weekId: getWeekId() }, { merge: false });
}

async function calcularIAS() {
  const weekId = getWeekId();
  const semana = await getSemanaActual().catch(() => null);

  // Garmin de los últimos 7 días
  const garminSemana = [];
  for (let i = 0; i < 7; i++) {
    const fecha = fechaLocalHoy(-i);
    const doc = await wpUser().doc(`garmin_${fecha}`).get();
    if (doc.exists) garminSemana.push(doc.data());
  }

  // Avances registrados esta semana
  const lunesDate = new Date(weekId.replace('week_', '') + 'T06:00:00Z');
  const avancesSnap = await db.collection('avances').where('timestamp', '>=', lunesDate).get();
  const avances = avancesSnap.docs.map(d => d.data());

  // Tareas de la semana
  const weekDoc = await wpUser().doc(weekId).get();
  const tasks = weekDoc.exists ? (weekDoc.data().tasks || []) : [];
  const tareasTotal = tasks.length;
  const tareasDone = tasks.filter(t => t.doneOnDay !== undefined).length;

  // 1. Alineación — avances hacia meta ancla
  const metaAnclaId = semana?.metaAncla?.id;
  const avancesAncla = metaAnclaId ? avances.filter(a => a.metaId === metaAnclaId).length : 0;
  const scoreAlineacion = Math.min(10, avancesAncla >= 4 ? 10 : avancesAncla * 2.5);

  // 2. Energía — Body Battery promedio
  const bbs = garminSemana.map(g => g.bodyBattery).filter(v => v != null);
  const avgBB = bbs.length ? Math.round(bbs.reduce((a, b) => a + b, 0) / bbs.length) : null;
  const scoreEnergia = avgBB != null ? Math.min(10, Math.round((avgBB / 100) * 10 * 10) / 10) : null;

  // 3. Ejecución — tareas completadas
  const scoreEjecucion = tareasTotal > 0 ? Math.min(10, Math.round((tareasDone / tareasTotal) * 10 * 10) / 10) : 5;

  // 4. Fricción — avances totales como proxy de momentum
  const scoreFriccion = Math.min(10, avances.length === 0 ? 3 : Math.min(10, 4 + avances.length));

  // 5. Descanso — horas de sueño promedio
  const suenos = garminSemana.map(g => g.suenoHoras).filter(v => v != null);
  const avgSueno = suenos.length ? Math.round((suenos.reduce((a, b) => a + b, 0) / suenos.length) * 10) / 10 : null;
  const scoreDescanso = avgSueno != null ? Math.min(10, Math.round((avgSueno / 8) * 10 * 10) / 10) : null;

  const validos = [scoreAlineacion, scoreEnergia, scoreEjecucion, scoreFriccion, scoreDescanso].filter(v => v != null);
  const total = validos.length ? Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 10) / 10 : null;

  return {
    total, scoreAlineacion, scoreEnergia, scoreEjecucion, scoreFriccion, scoreDescanso,
    avancesTotal: avances.length, avancesAncla, avgBB, avgSueno,
    tareasTotal, tareasDone, metaAncla: semana?.metaAncla?.nombre || null,
  };
}

function estrategiaEnergeticaAuto(cicloInfo, garmin) {
  const fase = cicloInfo?.fase || '';
  const bb = garmin?.bodyBattery;
  const stress = garmin?.stress;
  if (fase === 'Menstrual' || (bb !== null && bb < 35) || (stress !== null && stress > 75)) return 'recuperación';
  if (fase === 'Lútea Tardía' || (bb !== null && bb < 50)) return 'cierre';
  if (fase === 'Lútea Temprana') return 'mantenimiento';
  if (fase === 'Ovulación' && (bb === null || bb > 60)) return 'expansión';
  if (fase === 'Folicular' && (bb === null || bb > 50)) return 'ejecución';
  return 'mantenimiento';
}

async function getEnfoquesDiaWP() {
  const weekId = getWeekId();
  const wpDay = wpDayHoy();
  const doc = await wpUser().doc(weekId).get();
  const focusDia = doc.exists ? (doc.data().focus?.[wpDay] || {}) : {};
  return [1, 2, 3].map(n => focusDia[n]).filter(Boolean);
}

function detectarActividadMovimiento(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase();
  return MOVIMIENTO.find(m => m.keywords.some(k => t.includes(k))) || null;
}

function versionPorBB(bb) {
  if (bb === null || bb === undefined) return 'media';
  if (bb >= 65) return 'alta';
  if (bb >= 40) return 'media';
  return 'baja';
}

async function getWorkoutHabitsHoy() {
  try {
    const doc = await wpUser().doc(getWeekId()).get();
    if (!doc.exists) return { workouts: [], habitos: [] };
    const wo = doc.data().workout?.[wpDayHoy()] || {};
    const workouts = [wo.wo1, wo.wo2].filter(Boolean);
    const habitos = [wo.ha1, wo.ha2].filter(Boolean);
    return { workouts, habitos };
  } catch { return { workouts: [], habitos: [] }; }
}

function calcularCaloriasObjetivo(inbody, garmin, cicloInfo) {
  if (!inbody?.peso) return null;

  const peso = inbody.peso;
  const grasaPct = inbody.grasa_pct ?? 28;
  const lbm = peso * (1 - grasaPct / 100);

  // BMR Katch-McArdle (más preciso con composición corporal real)
  const bmr = Math.round(370 + (21.6 * lbm));

  // Multiplicador de actividad según BB del día
  const bb = garmin?.bodyBattery ?? null;
  let actMult = 1.4; // default moderado
  if (bb !== null) {
    if (bb >= 70) actMult = 1.55;
    else if (bb >= 45) actMult = 1.45;
    else actMult = 1.35;
  }

  // Ajuste por fase del ciclo
  let cicloAjuste = 0;
  const fase = cicloInfo?.fase ?? '';
  if (fase.includes('Lútea Tardía')) cicloAjuste = 150;
  else if (fase.includes('Lútea Temprana')) cicloAjuste = 100;
  else if (fase.includes('Menstrual')) cicloAjuste = -50;

  const tdee = Math.round(bmr * actMult);
  const deficit = 350; // déficit suave para bajar grasa sin perder músculo
  const objetivo = tdee + cicloAjuste - deficit;

  // Macros
  const proteina = Math.round(lbm * 2.2); // 2.2g/kg masa magra — preserva músculo en déficit
  const grasas = Math.round(peso * 0.8);
  const carbos = Math.max(80, Math.round((objetivo - proteina * 4 - grasas * 9) / 4));

  return { bmr, tdee, objetivo, proteina, carbos, grasas, deficit, cicloAjuste, lbm: Math.round(lbm * 10) / 10 };
}

async function getContextoDia() {
  const [garmin, cicloDoc, pendientes, tareas, enfoques, semana] = await Promise.all([
    getDatosGarmin().catch(() => null),
    getCiclo().catch(() => null),
    getPendientesWP().catch(() => []),
    getTareasHoy().catch(() => []),
    getEnfoquesDiaWP().catch(() => []),
    getSemanaActual().catch(() => null),
  ]);
  const luna = faseLunar();
  const cicloInfo = cicloDoc?.ultimoInicio
    ? calcularCiclo(cicloDoc.ultimoInicio, cicloDoc.duracionPromedio)
    : null;
  const notasCiclo = cicloDoc?.notasPersonales || null;

  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const fechaHoy = fechaLocalHoy();
  const diaHoy = dias[new Date(fechaHoy + 'T12:00:00').getDay()];
  const fechaFormato = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Merida' }).format(new Date());

  let ctx = `\nFecha de hoy: ${diaHoy} ${fechaFormato} (${fechaHoy})`;
  if (garmin) {
    ctx += `\nGarmin (${garmin.fecha}): sueño ${garmin.suenoHoras ?? 'N/D'}h score ${garmin.suenoScore ?? 'N/D'}, Body Battery ${garmin.bodyBattery ?? 'N/D'}, estrés ${garmin.stress ?? 'N/D'}, HRV ${garmin.hrv ?? 'N/D'}, FC reposo ${garmin.restingHR ?? 'N/D'}, SpO2 ${garmin.spo2 ?? 'N/D'}%`;
  }
  if (cicloInfo) {
    ctx += `\nCiclo: día ${cicloInfo.diaCiclo}, fase ${cicloInfo.fase}. Luna: ${luna}.`;
    if (notasCiclo) ctx += `\nNotas personales de Fer sobre su ciclo: ${notasCiclo}`;
  }
  if (semana) {
    const estrategia = semana.estrategiaEnergetica || estrategiaEnergeticaAuto(cicloInfo, garmin);
    ctx += `\n\nSEMANA PERFECTA ACTIVA (${semana.weekId}):`;
    ctx += `\n• Meta ancla: ${semana.metaAncla?.nombre || semana.metaAncla}`;
    if (semana.metasSecundarias?.length) ctx += `\n• Secundarias: ${semana.metasSecundarias.map(m => m.nombre || m).join(', ')}`;
    if (semana.metasSemilla?.length) ctx += `\n• Semilla: ${semana.metasSemilla.map(m => m.nombre || m).join(', ')}`;
    if (semana.intencionSemanal) ctx += `\n• Intención: "${semana.intencionSemanal}"`;
    ctx += `\n• Estrategia energética de hoy: ${estrategia}`;
  }
  if (tareas.length > 0) ctx += `\nTareas de hoy en el planner: ${tareas.slice(0, 5).join(', ')}`;
  if (enfoques.length > 0) ctx += `\nEnfoques del día: ${enfoques.join(' / ')}`;
  if (pendientes.length > 0) ctx += `\nPendientes abiertos (${pendientes.length}): ${pendientes.slice(0, 5).map(p => p.text).join(', ')}`;

  // === COMPOSICIÓN CORPORAL ===
  const cuerpo = await getCuerpoData().catch(() => null);
  if (cuerpo) {
    const ultimoInbody = (cuerpo.inbody || []).slice(-1)[0];
    const ultimasMedidas = (cuerpo.medidas || []).slice(-1)[0];
    if (ultimoInbody) {
      ctx += `\n\nCOMPOSICIÓN CORPORAL (InBody ${ultimoInbody.fecha}): peso ${ultimoInbody.peso}kg, músculo ${ultimoInbody.smm_total ?? 'N/D'}kg (${ultimoInbody.smm_pct ?? 'N/D'}%), grasa ${ultimoInbody.grasa_pct ?? 'N/D'}%`;

      const cals = calcularCaloriasObjetivo(ultimoInbody, garmin, cicloInfo);
      if (cals) {
        // Persist objetivo to WP Firebase for dashboard (merge to preserve consumed totals)
        wpUser().doc('nutricion_hoy').set({
          fecha: fechaLocalHoy(),
          objetivo: cals.objetivo,
          macros: { proteina: cals.proteina, carbos: cals.carbos, grasas: cals.grasas },
        }, { merge: true }).catch(e => console.error('nutricion objetivo wpUser:', e));
        ctx += `\n\nOBJETIVO CALÓRICO HOY: ${cals.objetivo} kcal`;
        ctx += `\n• TDEE estimado: ${cals.tdee} kcal · Déficit aplicado: ${cals.deficit} kcal`;
        if (cals.cicloAjuste !== 0) ctx += ` · Ajuste de ciclo: ${cals.cicloAjuste > 0 ? '+' : ''}${cals.cicloAjuste} kcal (${cicloInfo.fase})`;
        ctx += `\nMACROS META: Proteína ${cals.proteina}g · Carbos ${cals.carbos}g · Grasas ${cals.grasas}g`;
        ctx += `\n(Calculado con Katch-McArdle sobre masa magra ${cals.lbm}kg · Meta: déficit sostenible para bajar grasa sin perder músculo)`;

        // Consumo real del día
        const logHoy = await getComidaHoy().catch(() => null);
        if (logHoy && logHoy.entries.length > 0) {
          const t = logHoy.total;
          const restantes = cals.objetivo - t.calorias;
          ctx += `\n\nCONSUMO HOY (${logHoy.entries.length} registros):`;
          for (const e of logHoy.entries) {
            ctx += `\n  ${e.hora} · ${e.descripcion} · ${e.calorias} kcal`;
            if (e.proteina || e.carbos || e.grasas) ctx += ` (P:${e.proteina ?? '?'}g C:${e.carbos ?? '?'}g G:${e.grasas ?? '?'}g)`;
          }
          ctx += `\nTOTAL CONSUMIDO: ${t.calorias} kcal · P:${t.proteina}g · C:${t.carbos}g · G:${t.grasas}g`;
          ctx += `\nTE QUEDAN: ${restantes} kcal (${restantes < 0 ? '⚠️ superaste el objetivo' : 'disponibles para el resto del día'})`;
        } else {
          ctx += `\nConsumo de hoy: sin registros aún. Puedes decirme qué comiste y lo anoto.`;
        }
      }
    }
    if (ultimasMedidas) {
      ctx += `\nÚltimas medidas (${ultimasMedidas.fecha}): cintura ${ultimasMedidas.cintura_ombligo ?? '?'}cm, cadera ${ultimasMedidas.cadera ?? '?'}cm, pecho ${ultimasMedidas.pecho ?? '?'}cm`;
    }
    // Aviso de ventana de medidas (folicular día 5-10)
    if (cicloInfo && cicloInfo.fase === 'Folicular' && cicloInfo.diaCiclo >= 5 && cicloInfo.diaCiclo <= 10) {
      ctx += `\n⚡ VENTANA DE MEDIDAS: hoy es folicular día ${cicloInfo.diaCiclo} — condiciones ideales para medidas mensuales en ayunas.`;
    }
  }

  // === BIBLIOTECA DE MOVIMIENTO + HÁBITOS ===
  const { workouts, habitos } = await getWorkoutHabitsHoy().catch(() => ({ workouts: [], habitos: [] }));
  if (workouts.length > 0 || habitos.length > 0) {
    const bb = garmin?.bodyBattery ?? null;
    const version = versionPorBB(bb);
    ctx += `\n\nMOVIMIENTO Y HÁBITOS DE HOY (widget del planner):`;
    if (workouts.length > 0) {
      ctx += `\nWorkouts planeados: ${workouts.join(', ')}`;
      for (const w of workouts) {
        const ficha = detectarActividadMovimiento(w);
        if (ficha) {
          ctx += `\n\n📚 FICHA: ${ficha.nombre.toUpperCase()}`;
          ctx += `\n• Lo que estamos construyendo: ${ficha.capacidad_principal}`;
          ctx += `\n• También: ${ficha.capacidades_secundarias.slice(0, 3).join(', ')}`;
          ctx += `\n• Impacto articular: ${ficha.impacto_articular} | Recuperación: ${ficha.demanda_recuperacion}`;
          ctx += `\n• Beneficio SNS: ${ficha.beneficio_snc}`;
          ctx += `\n• Nutrición pre: ${ficha.nutricion_pre}`;
          ctx += `\n• Nutrición post: ${ficha.nutricion_post}`;
          ctx += `\n• Versión recomendada hoy (BB ${bb ?? 'N/D'} → ${version}): ${ficha[`version_${version}`]}`;
          ctx += `\n• Micro-aprendizaje: ${ficha.micro_aprendizaje}`;
          ctx += `\n• Frase: ${ficha.frase}`;
        }
      }
    }
    if (habitos.length > 0) {
      ctx += `\nHábitos planeados hoy: ${habitos.join(', ')}`;
      const habitosNoche = habitos.filter(h => /dormir|leer|meditar|descansar/i.test(h));
      if (habitosNoche.length > 0) ctx += ` (hábitos nocturnos: ${habitosNoche.join(', ')})`;
    }
  }

  return ctx;
}

async function fetchTextoUrl(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // Strip scripts, styles, then all tags, normalize whitespace
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s{3,}/g, '\n')
    .trim();
  return texto.slice(0, 8000); // Limitar para no saturar el contexto
}

// === INVENTARIO CASA ===

async function getInventarioCasa(filtro = {}) {
  const doc = await wpUser().doc('inventario_casa').get();
  let productos = doc.exists ? (doc.data().productos || []) : [];
  if (filtro.categoria) productos = productos.filter(p => p.categoria === filtro.categoria);
  if (filtro.estado) productos = productos.filter(p => p.estado === filtro.estado);
  if (filtro.buscar) {
    const q = filtro.buscar.toLowerCase();
    productos = productos.filter(p => p.nombre.toLowerCase().includes(q));
  }
  return productos;
}

async function agregarProductoCasa(producto) {
  const ref = wpUser().doc('inventario_casa');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const productos = doc.exists ? (doc.data().productos || []) : [];
    const nombreNuevo = producto.nombre.toLowerCase().trim();
    const idx = productos.findIndex(p => p.nombre.toLowerCase().trim() === nombreNuevo);
    if (idx >= 0) {
      productos[idx] = { ...productos[idx], ...producto, fechaActualizado: fechaLocalHoy() };
    } else {
      productos.push({ id: 'p' + Date.now(), ...producto, estado: producto.estado || 'disponible', fechaActualizado: fechaLocalHoy() });
    }
    t.set(ref, { productos });
  });
}

async function cargarListaProductosCasa(lista) {
  const ref = wpUser().doc('inventario_casa');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const productos = doc.exists ? (doc.data().productos || []) : [];
    let agregados = 0;
    for (const producto of lista) {
      const nombreNuevo = producto.nombre.toLowerCase().trim();
      const existe = productos.some(p => p.nombre.toLowerCase().trim() === nombreNuevo);
      if (!existe) {
        productos.push({ id: 'p' + Date.now() + agregados, ...producto, estado: 'disponible', fechaActualizado: fechaLocalHoy() });
        agregados++;
      }
    }
    t.set(ref, { productos });
    return agregados;
  });
}

async function actualizarProductoCasa(nombre, cambios) {
  const ref = wpUser().doc('inventario_casa');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    if (!doc.exists) return false;
    const productos = doc.data().productos || [];
    const lower = nombre.toLowerCase();
    const idx = productos.findIndex(p => p.nombre.toLowerCase().includes(lower));
    if (idx < 0) return false;
    productos[idx] = { ...productos[idx], ...cambios, fechaActualizado: fechaLocalHoy() };
    t.set(ref, { productos });
    return productos[idx];
  });
}

async function guardarRecetaWP(receta) {
  const ref = wpUser().doc('recetario');
  await wpDb.runTransaction(async t => {
    const doc = await t.get(ref);
    const recetas = doc.exists ? (doc.data().recetas || []) : [];
    // Evitar duplicados: no guardar si ya existe una receta con el mismo nombre (case-insensitive)
    const nombreNuevo = receta.nombre.toLowerCase().trim();
    const yaExiste = recetas.some(r => r.nombre.toLowerCase().trim() === nombreNuevo);
    if (yaExiste) return;
    recetas.push({ id: 'r' + Date.now(), ...receta, fechaGuardada: fechaLocalHoy() });
    t.set(ref, { recetas });
  });
}

async function getRecetarioWP() {
  const doc = await wpUser().doc('recetario').get();
  return doc.exists ? (doc.data().recetas || []) : [];
}

async function guardarMenuSemanaWP(menu) {
  await wpUser().doc('menu_semana').set({ menu, semana: getWeekId(), actualizado: fechaLocalHoy() }, { merge: true });
}

async function getMenuSemanaWP() {
  const doc = await wpUser().doc('menu_semana').get();
  return doc.exists ? doc.data() : null;
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
    description: 'Agrega UN solo item a la lista del súper. Si necesitas agregar varios items (ej. una lista de compras basada en un menú), usa agregar_lista_super en su lugar — es una sola llamada para todos.',
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
    name: 'agregar_lista_super',
    description: 'Agrega MÚLTIPLES items a la lista del súper en una sola llamada. Úsala siempre que necesites agregar una lista de ingredientes o compras (ej. basada en un menú semanal). Regla de categorías: frutas y verduras frescas → "Mercado"; lácteos, proteínas, granos, enlatados, limpieza y todo lo demás → "Supermercado". "Personal Fer" y "Personal Cris" solo para artículos de uso personal.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lista de items a agregar',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string', description: 'Nombre del producto' },
              categoria: { type: 'string', enum: SHOP_CATS, description: 'Categoría' },
            },
            required: ['item', 'categoria'],
          },
        },
      },
      required: ['items'],
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
    name: 'registrar_comida',
    description: 'Registra lo que Fernanda comió o bebió durante el día, con sus calorías y macros. Úsala cuando mencione que comió, desayunó, almorzó, cenó, tomó un snack, o cualquier alimento. Si no sabe los macros exactos, estímalos razonablemente según el alimento. El registro se acumula durante el día y se usa para calcular calorías restantes.',
    input_schema: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Qué comió, ej. "2 huevos revueltos con aguacate y café sin azúcar"' },
        calorias: { type: 'number', description: 'Calorías estimadas o reales del alimento/comida' },
        proteina: { type: 'number', description: 'Gramos de proteína estimados (0 si no aplica)' },
        carbos: { type: 'number', description: 'Gramos de carbohidratos estimados (0 si no aplica)' },
        grasas: { type: 'number', description: 'Gramos de grasa estimados (0 si no aplica)' },
        hora: { type: 'string', description: 'Hora en formato HH:MM, ej. "08:30". Omitir para usar la hora actual.' },
      },
      required: ['descripcion', 'calorias'],
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
    name: 'ver_agenda_dia',
    description: 'Lee los eventos/citas del día en el Weekly Planner de Fernanda. OBLIGATORIO: úsala siempre que pregunte qué tiene en su agenda o qué eventos tiene hoy/mañana — nunca respondas eso sin llamar esta herramienta primero.',
    input_schema: {
      type: 'object',
      properties: {
        dia: { type: 'number', description: 'Día de la semana (0=lunes…6=domingo). Omitir para hoy.', minimum: 0, maximum: 6 },
      },
      required: [],
    },
  },
  {
    name: 'agregar_evento',
    description: 'Agrega un evento o cita a la agenda del día en el Weekly Planner. Úsala cuando Fernanda mencione una cita, reunión, compromiso o evento que quiera agendar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Nombre del evento o cita' },
        hora: { type: 'string', description: 'Hora en formato "9:30 AM" o "3:00 PM"' },
        duracion_mins: { type: 'number', description: 'Duración en minutos (default 60)' },
        dia: { type: 'number', description: 'Día de la semana (0=lunes…6=domingo). Omitir para hoy.', minimum: 0, maximum: 6 },
      },
      required: ['titulo', 'hora'],
    },
  },
  {
    name: 'borrar_evento',
    description: 'Elimina un evento de la agenda del día en el Weekly Planner. Usa parte del título para identificarlo.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Texto o fragmento del título del evento a borrar' },
        dia: { type: 'number', description: 'Día de la semana (0=lunes…6=domingo). Omitir para hoy.', minimum: 0, maximum: 6 },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'ver_inventario_casa',
    description: 'Consulta el inventario de productos del hogar de Fernanda. Úsala cuando pregunte qué tiene en casa, qué le falta, qué está agotado, o cuando necesites saber si tiene un ingrediente disponible.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', description: 'Filtrar por: despensa, refrigerador, congelador, limpieza, baño, mascotas, cuidado_mama, farmacia, lavanderia, cocina' },
        estado: { type: 'string', description: 'Filtrar por: disponible, bajo, agotado, por_caducar' },
        buscar: { type: 'string', description: 'Buscar producto por nombre' },
      },
      required: [],
    },
  },
  {
    name: 'agregar_producto_casa',
    description: 'Agrega o actualiza un producto en el inventario del hogar. Úsala cuando mencione productos que tiene en casa, frecuencia de compra, etc.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del producto' },
        categoria: { type: 'string', description: 'despensa, refrigerador, congelador, limpieza, baño, mascotas, cuidado_mama, farmacia, lavanderia, cocina' },
        unidad: { type: 'string', description: 'piezas, litros, kg, g, rollos, etc.' },
        frecuencia: { type: 'string', description: 'diario, semanal, quincenal, mensual' },
        prioridad: { type: 'string', description: 'alta, media, baja' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
      },
      required: ['nombre', 'categoria'],
    },
  },
  {
    name: 'actualizar_estado_producto',
    description: 'Actualiza el estado de un producto del inventario. OBLIGATORIO usar cuando diga: "se acabó X" → agotado, "me queda poco X" → bajo, "compré X" → disponible, "caducan X" → por_caducar. Cuando marques algo como agotado o bajo, agrégalo automáticamente a la lista del súper con agregar_item_super.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del producto' },
        estado: { type: 'string', description: 'disponible, bajo, agotado, por_caducar, caducado' },
        cantidad: { type: 'string', description: 'Cantidad actualizada (opcional)' },
      },
      required: ['nombre', 'estado'],
    },
  },
  {
    name: 'cargar_lista_productos_casa',
    description: 'Carga una lista grande de productos del hogar de una sola vez. Úsala cuando Fernanda pegue o dicte su lista maestra de productos recurrentes. Infiere categoría, frecuencia y prioridad de cada producto automáticamente.',
    input_schema: {
      type: 'object',
      properties: {
        productos: {
          type: 'array',
          description: 'Lista de productos a cargar',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              categoria: { type: 'string' },
              unidad: { type: 'string' },
              frecuencia: { type: 'string' },
              prioridad: { type: 'string' },
            },
            required: ['nombre', 'categoria'],
          },
        },
      },
      required: ['productos'],
    },
  },
  {
    name: 'leer_url_receta',
    description: 'Lee el contenido de una URL (receta de Pinterest, blog de cocina, etc.) para extraer ingredientes y preparación. Úsala cuando Fernanda comparte un link de receta. Después de leerla, extrae el nombre, ingredientes y pasos, y pregúntale si quiere guardarla en su recetario.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL completa de la receta (Pinterest, blog, etc.)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'guardar_receta',
    description: 'Guarda una receta en Firebase. Infiere AUTOMÁTICAMENTE todos los metadatos — el usuario nunca los escribe. SIEMPRE incluir calorias, proteina, costo_aproximado. Para etiquetas usa la taxonomía estándar: MOMENTO (pre_gym, post_gym, pre_cardio, post_cardio, pre_natacion, pre_equitacion, desayuno, comida, cena, snack), CICLO (ideal_folicular, ideal_ovulacion, ideal_lutea_temprana, ideal_lutea_tardia, ideal_menstrual), PROPIEDADES (alta_proteina, alta_fibra, altos_carbos, alta_saciedad, baja_carga_digestiva, antiinflamatoria, comfort_food, ligera), MICRONUTRIENTES (hierro, magnesio, omega3, vitamina_c, colageno, electrolitos), PREP (rapida, batch_cooking, sin_coccion, menos_10_min, meal_prep), ENERGIA (alta_energia, recuperacion). Asigna TODAS las que apliquen.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        ingredientes: { type: 'string', description: 'Lista de ingredientes con cantidades' },
        preparacion: { type: 'string', description: 'Pasos numerados' },
        tiempo_minutos: { type: 'number', description: 'Tiempo total de preparación' },
        porciones: { type: 'number', description: 'Número de porciones' },
        calorias: { type: 'string', description: 'Ej: "380-420 kcal por porción"' },
        proteina: { type: 'string', description: 'Ej: "28g"' },
        carbohidratos: { type: 'string', description: 'Ej: "35g"' },
        grasas: { type: 'string', description: 'Ej: "12g"' },
        costo_aproximado: { type: 'string', description: 'Ej: "económica (~$120 MXN)"' },
        tipo_platillo: { type: 'string', description: 'smoothie, ensalada, sopa, guisado, bowl, wrap, omelette, etc.' },
        momento_ideal: { type: 'string', description: 'desayuno_rapido, comida_familiar, cena_ligera, snack, meal_prep' },
        etiquetas: { type: 'array', items: { type: 'string' }, description: 'Array de etiquetas de la taxonomía estándar. Ej: ["post_gym","alta_proteina","ideal_folicular","batch_cooking"]' },
        ingredientes_principales: { type: 'string', description: 'Proteína principal: pollo, res, atun, huevo, etc.' },
        fase_ciclo: { type: 'array', items: { type: 'string' }, description: 'Fases del ciclo donde es ideal: ["folicular","ovulacion","lutea_temprana","lutea_tardia","menstrual"]' },
        objetivo_fisiologico: { type: 'string', description: 'Qué objetivo fisiológico apoya: construir_musculo, recuperacion, reducir_cortisol, reponer_hierro, controlar_inflamacion, energia_sostenida, etc.' },
        url: { type: 'string', description: 'URL de origen (opcional)' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
      },
      required: ['nombre', 'ingredientes', 'calorias', 'costo_aproximado'],
    },
  },
  {
    name: 'ver_recetario',
    description: 'Busca recetas en el recetario. OBLIGATORIO cuando pregunte por recetas, pida el menú semanal, o quiera saber qué cocinar según su ciclo/energía. Filtra por nombre, ingrediente, etiqueta o fase del ciclo.',
    input_schema: {
      type: 'object',
      properties: {
        buscar: { type: 'string', description: 'Texto para filtrar por nombre o ingrediente (opcional)' },
        etiqueta: { type: 'string', description: 'Filtrar por etiqueta: post_gym, ideal_lutea_tardia, magnesio, etc. (opcional)' },
        fase_ciclo: { type: 'string', description: 'Filtrar por fase del ciclo: folicular, ovulacion, lutea_temprana, lutea_tardia, menstrual (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'borrar_receta',
    description: 'Elimina una receta del recetario por nombre. Úsala cuando Fernanda pida borrar o eliminar una receta específica.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre o fragmento del nombre de la receta a borrar' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'guardar_menu_semana',
    description: 'Guarda el menú semanal planeado de Fernanda (desayuno, comida y cena por día). Úsala cuando terminen de diseñar el menú juntas.',
    input_schema: {
      type: 'object',
      properties: {
        menu: { type: 'string', description: 'El menú completo de la semana en texto libre' },
      },
      required: ['menu'],
    },
  },
  {
    name: 'ver_menu_semana',
    description: 'Lee el menú semanal guardado de Fernanda. Úsala cuando pregunte qué tiene planeado comer o para generar la lista del súper.',
    input_schema: { type: 'object', properties: {}, required: [] },
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
    name: 'ver_semana_perfecta',
    description: 'Lee la Semana Perfecta activa: meta ancla, secundarias, semilla, intención y estrategia energética de esta semana. Úsala cuando Fer pregunte por sus metas de la semana, su plan semanal, o quiera saber en qué está enfocada.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'guardar_semana_perfecta',
    description: 'Guarda la Semana Perfecta propuesta: meta ancla, 2 metas secundarias, hasta 3 metas semilla, intención semanal y estrategia energética. Úsala después de que Fernanda apruebe o ajuste la propuesta del domingo.',
    input_schema: {
      type: 'object',
      properties: {
        metaAncla: { type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' } }, required: ['id', 'nombre'], description: 'La meta principal de la semana' },
        metasSecundarias: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' } } }, description: '2 metas secundarias' },
        metasSemilla: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' } } }, description: 'Hasta 3 metas semilla' },
        intencionSemanal: { type: 'string', description: 'Frase corta que resume el espíritu de la semana' },
        estrategiaEnergetica: { type: 'string', enum: ['expansión', 'ejecución', 'mantenimiento', 'cierre', 'recuperación'], description: 'Estrategia según ciclo y energía' },
      },
      required: ['metaAncla', 'metasSecundarias', 'metasSemilla', 'intencionSemanal', 'estrategiaEnergetica'],
    },
  },
  {
    name: 'ver_lista_super',
    description: 'Lee la lista del súper actual del Weekly Planner de Fernanda, con todos sus ítems por categoría. OBLIGATORIO: úsala siempre que pregunte qué tiene en la lista, qué le falta comprar, o cualquier consulta sobre la lista del súper — nunca respondas sin llamar esta herramienta primero.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'tachar_item_super',
    description: 'Marca un ítem de la lista del súper como comprado (done). Si no sabes la categoría exacta, omítela y buscará en todas.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre o fragmento del ítem a marcar como comprado' },
        categoria: { type: 'string', enum: SHOP_CATS, description: 'Categoría donde está el ítem (opcional)' },
      },
      required: ['item'],
    },
  },
  {
    name: 'borrar_item_super',
    description: 'Elimina por completo un ítem de la lista del súper (no solo lo tacha, lo borra). Úsala cuando Fernanda diga "quita", "elimina", "borra" un ítem de la lista.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre o fragmento del ítem a eliminar' },
        categoria: { type: 'string', enum: SHOP_CATS, description: 'Categoría donde está el ítem (opcional)' },
      },
      required: ['item'],
    },
  },
  {
    name: 'ver_historial_cuerpo',
    description: 'Muestra el historial de composición corporal de Fernanda: estudios InBody, medidas físicas mensuales y check-ins semanales. Úsalo para analizar progreso o antes de dar consejos de nutrición/ejercicio.',
    input_schema: { type: 'object', properties: { tipo: { type: 'string', enum: ['inbody', 'medidas', 'checkins', 'todo'], description: 'Qué historial mostrar' } }, required: ['tipo'] },
  },
  {
    name: 'guardar_inbody',
    description: 'Guarda un estudio InBody de composición corporal con todos sus datos.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha del estudio YYYY-MM-DD' },
        peso: { type: 'number', description: 'Peso en kg' },
        altura: { type: 'number', description: 'Altura en cm' },
        imc: { type: 'number', description: 'IMC kg/m²' },
        smm_total: { type: 'number', description: 'Masa muscular esquelética total en kg' },
        smm_pct: { type: 'number', description: '% de músculo' },
        grasa_pct: { type: 'number', description: '% grasa corporal' },
        grasa_kg: { type: 'number', description: 'Grasa en kg' },
        agua_pct: { type: 'number', description: '% agua corporal' },
        metabolismo_basal: { type: 'number', description: 'Metabolismo basal en kcal' },
        grasa_visceral: { type: 'number', description: 'Nivel de grasa visceral' },
        smm_brazo_der: { type: 'number' }, smm_brazo_izq: { type: 'number' },
        smm_torso: { type: 'number' }, smm_pierna_der: { type: 'number' }, smm_pierna_izq: { type: 'number' },
        notas: { type: 'string', description: 'Notas adicionales (fase ciclo, condiciones)' },
      },
      required: ['fecha', 'peso'],
    },
  },
  {
    name: 'guardar_medidas',
    description: 'Guarda medidas físicas mensuales de Fernanda (cintura, cadera, pecho, brazos, muslos, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        cintura_alta: { type: 'number' }, cintura_ombligo: { type: 'number' },
        cadera: { type: 'number' }, pecho: { type: 'number' },
        brazo_der: { type: 'number' }, brazo_izq: { type: 'number' },
        muslo_der: { type: 'number' }, muslo_izq: { type: 'number' },
        pantorrilla_der: { type: 'number' }, pantorrilla_izq: { type: 'number' },
        peso: { type: 'number' },
        ropa: { type: 'string', description: 'Cómo le queda la ropa' },
        inflamacion: { type: 'number', description: '1-5' },
        notas: { type: 'string' },
        fase_ciclo: { type: 'string' }, dia_ciclo: { type: 'number' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'guardar_checkin_semanal',
    description: 'Guarda el check-in semanal de cuerpo del viernes.',
    input_schema: {
      type: 'object',
      properties: {
        ropa: { type: 'string', description: 'Cómo le queda la ropa esta semana' },
        inflamacion: { type: 'number', description: '1-5' },
        energia: { type: 'number', description: '1-5' },
        fuerza: { type: 'number', description: '1-5' },
        entrenamientos: { type: 'string', description: '¿Cumplió sus entrenamientos?' },
        proteina: { type: 'string', description: '¿Cómo estuvo la proteína?' },
        notas: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'ver_staples',
    description: 'Muestra la lista de staples (artículos base que Fernanda siempre debe tener en casa). Útil para saber qué tiene disponible para cocinar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'agregar_staple',
    description: 'Agrega un artículo a los staples de Fernanda (cosas que siempre tiene en casa). Usa catIndex: 0 para Mercado, 1 para Supermercado.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre del artículo' },
        catIndex: { type: 'number', description: '0=Mercado, 1=Supermercado', enum: [0, 1] },
      },
      required: ['item', 'catIndex'],
    },
  },
  {
    name: 'borrar_staple',
    description: 'Elimina un artículo de los staples de Fernanda.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Nombre o fragmento del artículo a eliminar' },
      },
      required: ['item'],
    },
  },
  {
    name: 'editar_widget',
    description: 'Edita el widget de workouts y hábitos del Weekly Planner para un día específico. Workouts válidos: gym, pilates, natación, equitación, yoga, tennis, padel, escalar, apnea. Hábitos válidos: escribir, gratitud, leer, meditar, practicar violin, suplementos, dormirse temprano, dormir 8 horas, tomar agua. Para quitar un valor usa "". wo1/ha1 = mañana, wo2/ha2 = noche.',
    input_schema: {
      type: 'object',
      properties: {
        dia: { type: 'string', description: 'Día a editar: "hoy" o "mañana"' },
        campo: { type: 'string', enum: ['wo1', 'wo2', 'ha1', 'ha2'], description: 'wo1=workout mañana, wo2=workout noche, ha1=hábito mañana, ha2=hábito noche' },
        valor: { type: 'string', description: 'Valor a guardar. String vacío "" para quitar.' },
      },
      required: ['dia', 'campo', 'valor'],
    },
    cache_control: { type: 'ephemeral' },
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

// Cache para evitar que el mismo tool se ejecute más de una vez
// con el mismo input dentro de una ventana de 60 segundos
const _toolCache = new Map();
function _toolKey(nombre, input) {
  return `${nombre}:${JSON.stringify(input)}`;
}
function _yaCorrió(nombre, input) {
  const key = _toolKey(nombre, input);
  const ts = _toolCache.get(key);
  if (ts && Date.now() - ts < 60000) return true;
  _toolCache.set(key, Date.now());
  return false;
}
// Tools de solo lectura que sí pueden correr múltiples veces
const TOOLS_LECTURA = new Set(['ver_pendientes','ver_agenda_dia','ver_datos_garmin','ver_ciclo_luna','ver_lista_super','ver_inventario_casa','ver_staples','ver_historial_cuerpo']);

async function ejecutarHerramienta(nombre, input) {
  if (!TOOLS_LECTURA.has(nombre) && _yaCorrió(nombre, input)) {
    return { resultado: 'Ya ejecutado recientemente — no se duplica.', etiqueta: null };
  }
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

    case 'agregar_lista_super': {
      const items = input.items || [];
      const agregados = [];
      for (const { item, categoria } of items) {
        const catIdx = SHOP_CATS.findIndex(c => c.toLowerCase() === String(categoria).toLowerCase());
        const idx = catIdx >= 0 ? catIdx : 0;
        await agregarItemSuperWP(item, idx);
        agregados.push(`${item} (${SHOP_CATS[idx]})`);
      }
      return {
        resultado: `${agregados.length} items agregados al súper: ${agregados.join(', ')}`,
        etiqueta: `${agregados.length} items agregados al súper ✓`,
      };
    }

    case 'guardar_avance_meta': {
      const meta = METAS.find(m => m.id === input.meta_id);
      await guardarAvance(input.meta_id, input.texto);
      return { resultado: `Avance guardado en ${meta?.nombre || input.meta_id}`, etiqueta: `avance en ${meta?.nombre || input.meta_id} ✓` };
    }

    case 'guardar_dato_importante':
      await guardarDatoImportante(input.texto);
      return { resultado: `Guardado en memoria: "${input.texto}"`, etiqueta: 'dato guardado en memoria ✓' };

    case 'registrar_comida': {
      const log = await registrarComida(
        input.descripcion,
        input.calorias,
        input.proteina || 0,
        input.carbos || 0,
        input.grasas || 0,
        input.hora || null,
      );
      const t = log.total;
      return {
        resultado: `Registrado: "${input.descripcion}" — ${input.calorias} kcal. Total hoy: ${t.calorias} kcal (P:${t.proteina}g C:${t.carbos}g G:${t.grasas}g)`,
        etiqueta: `${input.calorias} kcal registradas ✓`,
      };
    }

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

    case 'ver_agenda_dia': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      const eventos = await getEventosDia(dia);
      if (eventos.length === 0) return { resultado: 'No hay eventos agendados para ese día.', etiqueta: null };
      const lista = eventos.map(e => `• ${e.time} — ${e.title}${e.durMins ? ` (${e.durMins} min)` : ''}`).join('\n');
      return { resultado: lista, etiqueta: null };
    }

    case 'agregar_evento': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      await agregarEventoWP(input.titulo, input.hora, input.duracion_mins || 60, dia);
      return { resultado: `Evento agregado: ${input.hora} — ${input.titulo}`, etiqueta: `${input.titulo} agendado ✓` };
    }

    case 'borrar_evento': {
      const dia = typeof input.dia === 'number' ? input.dia : null;
      const borrado = await borrarEventoWP(input.titulo, dia);
      if (!borrado) return { resultado: `No encontré un evento con "${input.titulo}" en ese día.`, etiqueta: null };
      return { resultado: `Evento eliminado: "${borrado}"`, etiqueta: `"${borrado}" eliminado de agenda ✓` };
    }

    case 'ver_inventario_casa': {
      const productos = await getInventarioCasa(input);
      if (productos.length === 0) return { resultado: 'No hay productos en el inventario con esos filtros.', etiqueta: null };
      const porCategoria = {};
      for (const p of productos) {
        const cat = p.categoria || 'varios';
        if (!porCategoria[cat]) porCategoria[cat] = [];
        const estadoIcon = { disponible: '✅', bajo: '⚠️', agotado: '❌', por_caducar: '⏰', caducado: '🚫' }[p.estado] || '•';
        porCategoria[cat].push(`${estadoIcon} ${p.nombre}${p.notas ? ` (${p.notas})` : ''}`);
      }
      const lista = Object.entries(porCategoria).map(([cat, items]) => `*${cat}:*\n${items.join('\n')}`).join('\n\n');
      return { resultado: lista, etiqueta: null };
    }

    case 'agregar_producto_casa': {
      await agregarProductoCasa(input);
      return { resultado: `"${input.nombre}" agregado al inventario (${input.categoria}).`, etiqueta: `${input.nombre} en inventario ✓` };
    }

    case 'actualizar_estado_producto': {
      const resultado = await actualizarProductoCasa(input.nombre, { estado: input.estado, ...(input.cantidad ? { cantidad: input.cantidad } : {}) });
      if (!resultado) return { resultado: `No encontré "${input.nombre}" en el inventario. ¿Quieres que lo agregue?`, etiqueta: null };
      return { resultado: `"${resultado.nombre}" actualizado → ${input.estado}`, etiqueta: `${resultado.nombre}: ${input.estado} ✓` };
    }

    case 'cargar_lista_productos_casa': {
      await cargarListaProductosCasa(input.productos);
      return { resultado: `${input.productos.length} productos cargados al inventario.`, etiqueta: `${input.productos.length} productos en inventario ✓` };
    }

    case 'leer_url_receta': {
      try {
        const texto = await fetchTextoUrl(input.url);
        return { resultado: texto, etiqueta: null };
      } catch (e) {
        return { resultado: `No pude leer esa URL: ${e.message}`, etiqueta: null };
      }
    }

    case 'guardar_receta': {
      await guardarRecetaWP({
        nombre: input.nombre,
        ingredientes: input.ingredientes,
        pasos: input.preparacion || '',
        url: input.url || '',
        tags: Array.isArray(input.etiquetas) ? input.etiquetas : (input.etiquetas ? [input.etiquetas] : []),
        calorias: input.calorias || '',
        costo: input.costo_aproximado || '',
        tiempo_minutos: input.tiempo_minutos || null,
        porciones: input.porciones || null,
        proteina: input.proteina || '',
        carbohidratos: input.carbohidratos || '',
        grasas: input.grasas || '',
        tipo_platillo: input.tipo_platillo || '',
        momento_ideal: input.momento_ideal || '',
        ingredientes_principales: input.ingredientes_principales || '',
        fase_ciclo: Array.isArray(input.fase_ciclo) ? input.fase_ciclo : (input.fase_ciclo ? [input.fase_ciclo] : []),
        objetivo_fisiologico: input.objetivo_fisiologico || '',
        notas: input.notas || '',
      });
      return { resultado: `Receta "${input.nombre}" guardada en el recetario.`, etiqueta: `"${input.nombre}" guardada en recetario ✓` };
    }

    case 'ver_recetario': {
      const recetas = await getRecetarioWP();
      if (recetas.length === 0) return { resultado: 'El recetario está vacío todavía.', etiqueta: null };
      const filtro = input.buscar?.toLowerCase();
      const filtroEtiqueta = input.etiqueta?.toLowerCase();
      const filtroFase = input.fase_ciclo?.toLowerCase();
      const lista = recetas.filter(r => {
        const tagsArr = Array.isArray(r.tags) ? r.tags : (r.tags ? [r.tags] : []);
        const fasesArr = Array.isArray(r.fase_ciclo) ? r.fase_ciclo : (r.fase_ciclo ? [r.fase_ciclo] : []);
        if (filtro && !r.nombre.toLowerCase().includes(filtro) && !(r.ingredientes || '').toLowerCase().includes(filtro) && !tagsArr.some(t => t.toLowerCase().includes(filtro))) return false;
        if (filtroEtiqueta && !tagsArr.some(t => t.toLowerCase().includes(filtroEtiqueta))) return false;
        if (filtroFase && !fasesArr.some(f => f.toLowerCase().includes(filtroFase))) return false;
        return true;
      });
      if (lista.length === 0) return { resultado: `No encontré recetas con "${input.buscar}".`, etiqueta: null };
      // Solo muestra receta completa si hay exactamente UNA coincidencia
      if (lista.length === 1) {
        const r = lista[0];
        const kcal = r.calorias ? `\n\n🔥 ~${r.calorias} por porción` : '';
        const costo = r.costo ? `\n💰 ${r.costo}` : '';
        const tiempo = r.tiempo_minutos ? `⏱ ${r.tiempo_minutos} min` : '';
        const porciones = r.porciones ? ` · ${r.porciones} porciones` : '';
        const info = [tiempo + porciones, kcal.replace('\n\n',''), costo.replace('\n','')].filter(Boolean).join('  ·  ');
        const macro = [r.proteina && `Proteína: ${r.proteina}`, r.carbohidratos && `Carbos: ${r.carbohidratos}`, r.grasas && `Grasas: ${r.grasas}`].filter(Boolean).join(' · ');
        return { resultado: `📖 *${r.nombre}*${info ? `\n${info}` : ''}${macro ? `\n${macro}` : ''}\n\n🥗 *Ingredientes:*\n${r.ingredientes}\n\n👩‍🍳 *Preparación:*\n${r.pasos || 'No guardada'}${r.notas ? `\n\n📝 ${r.notas}` : ''}${r.url ? `\n\n🔗 ${r.url}` : ''}`, etiqueta: null };
      }
      // Múltiples resultados → solo lista los nombres para que elija
      const encabezado = filtro ? `${lista.length} recetas con "${input.buscar}":` : `Tienes ${lista.length} recetas:`;
      return { resultado: `${encabezado}\n` + lista.map(r => `• ${r.nombre}${r.tags ? ` [${r.tags}]` : ''}`).join('\n') + '\n\nPide una por nombre para ver los ingredientes y pasos.', etiqueta: null };
    }

    case 'borrar_receta': {
      const ref = wpUser().doc('recetario');
      let borrada = null;
      await wpDb.runTransaction(async t => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const recetas = doc.data().recetas || [];
        const lower = input.nombre.toLowerCase();
        const idx = recetas.findIndex(r => r.nombre.toLowerCase().includes(lower));
        if (idx < 0) return;
        borrada = recetas[idx].nombre;
        recetas.splice(idx, 1);
        t.set(ref, { recetas });
      });
      if (!borrada) return { resultado: `No encontré ninguna receta con "${input.nombre}".`, etiqueta: null };
      return { resultado: `"${borrada}" eliminada del recetario.`, etiqueta: `"${borrada}" borrada ✓` };
    }

    case 'guardar_menu_semana': {
      await guardarMenuSemanaWP(input.menu);
      return { resultado: 'Menú semanal guardado.', etiqueta: 'menú de la semana guardado ✓' };
    }

    case 'ver_menu_semana': {
      const menu = await getMenuSemanaWP();
      if (!menu) return { resultado: 'No hay menú guardado para esta semana.', etiqueta: null };
      return { resultado: `Menú semana ${menu.semana} (actualizado ${menu.actualizado}):\n${menu.menu}`, etiqueta: null };
    }

    case 'ver_datos_garmin': {
      const datos = await getDatosGarmin();
      if (!datos) return { resultado: 'No hay datos de Garmin sincronizados todavía.', etiqueta: null };
      const syncInfo = datos.ultimoSync ? ` (sync ${datos.ultimoSync})` : '';
      const resultado = `Datos de Garmin del ${datos.fecha}${syncInfo}: HRV ${datos.hrv ?? 'N/D'}, Body Battery ${datos.bodyBattery ?? 'N/D'}, estrés ${datos.stress ?? 'N/D'}, FC en reposo ${datos.restingHR ?? 'N/D'}, SpO2 ${datos.spo2 ?? 'N/D'}%, sueño ${datos.suenoHoras ?? 'N/D'}h (score ${datos.suenoScore ?? 'N/D'}). Nota: los datos de Body Battery y sueño se finalizan en Garmin entre 8-9am — el sync de 8:30am tiene los valores corregidos.`;
      return { resultado, etiqueta: null };
    }

    case 'ver_ciclo_luna': {
      const ciclo = await getCiclo();
      const luna = faseLunar();
      const guiaLuna = guiaLunaActual(luna);
      const notas = ciclo?.notasPersonales ? `\nNotas personales de Fernanda sobre su ciclo: ${ciclo.notasPersonales}` : '';
      if (!ciclo || !ciclo.ultimoInicio) {
        return { resultado: `Fase lunar de hoy: ${luna}.\n${guiaLuna}${notas}\nNo tengo registrado el inicio de su último periodo.`, etiqueta: null };
      }
      const { diaCiclo, fase } = calcularCiclo(ciclo.ultimoInicio, ciclo.duracionPromedio);
      return { resultado: `Día ${diaCiclo} del ciclo menstrual, fase ${fase}.\nFase lunar: ${luna}.\n${guiaLuna}${notas}`, etiqueta: null };
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

    case 'ver_semana_perfecta': {
      const semana = await getSemanaActual();
      if (!semana) return { resultado: 'No hay Semana Perfecta guardada para esta semana. Puedes generarla ahora.', etiqueta: null };
      let r = `Semana Perfecta (${semana.weekId}):\n`;
      r += `• Meta ancla: ${semana.metaAncla?.nombre}\n`;
      r += `• Secundarias: ${(semana.metasSecundarias || []).map(m => m.nombre).join(', ')}\n`;
      r += `• Semilla: ${(semana.metasSemilla || []).map(m => m.nombre).join(', ')}\n`;
      r += `• Intención: "${semana.intencionSemanal}"\n`;
      r += `• Estrategia: ${semana.estrategiaEnergetica}`;
      return { resultado: r, etiqueta: null };
    }

    case 'guardar_semana_perfecta': {
      await guardarSemanaActual({
        metaAncla: input.metaAncla,
        metasSecundarias: input.metasSecundarias,
        metasSemilla: input.metasSemilla,
        intencionSemanal: input.intencionSemanal,
        estrategiaEnergetica: input.estrategiaEnergetica,
        generadaEn: new Date().toISOString(),
      });
      return { resultado: `Semana Perfecta guardada ✓\nMeta ancla: ${input.metaAncla.nombre}\nIntención: "${input.intencionSemanal}"\nEstrategia: ${input.estrategiaEnergetica}`, etiqueta: 'Semana Perfecta guardada ✓' };
    }

    case 'ver_lista_super': {
      const cats = await getListaSuperWP();
      let resultado = '';
      let total = 0;
      SHOP_CATS.forEach((nombre, i) => {
        const pendientes = (cats[`cat${i}`] || []).filter(it => !it.done);
        const comprados = (cats[`cat${i}`] || []).filter(it => it.done);
        if (pendientes.length > 0 || comprados.length > 0) {
          resultado += `\n${nombre}:\n`;
          pendientes.forEach(it => { resultado += `  ☐ ${it.text}\n`; total++; });
          comprados.forEach(it => { resultado += `  ✓ ${it.text} (comprado)\n`; });
        }
      });
      if (!resultado) return { resultado: 'La lista del súper está vacía.', etiqueta: null };
      return { resultado: `Lista del súper (${total} pendientes):\n${resultado}`, etiqueta: null };
    }

    case 'tachar_item_super': {
      const catIdx = input.categoria
        ? SHOP_CATS.findIndex(c => c.toLowerCase() === String(input.categoria).toLowerCase())
        : null;
      const tachado = await tacharItemSuperWP(input.item, catIdx >= 0 ? catIdx : null);
      if (!tachado) return { resultado: `No encontré "${input.item}" en la lista.`, etiqueta: null };
      return { resultado: `"${tachado}" marcado como comprado ✓`, etiqueta: `${tachado} comprado ✓` };
    }

    case 'borrar_item_super': {
      const catIdx = input.categoria
        ? SHOP_CATS.findIndex(c => c.toLowerCase() === String(input.categoria).toLowerCase())
        : null;
      const borrado = await borrarItemSuperWP(input.item, catIdx >= 0 ? catIdx : null);
      if (!borrado) return { resultado: `No encontré "${input.item}" en la lista.`, etiqueta: null };
      return { resultado: `"${borrado}" eliminado de la lista`, etiqueta: `${borrado} eliminado ✓` };
    }

    case 'ver_historial_cuerpo': {
      const cuerpo = await getCuerpoData();
      const tipo = input.tipo || 'todo';
      let resultado = '';
      if (tipo === 'inbody' || tipo === 'todo') {
        const ib = cuerpo.inbody || [];
        if (ib.length) resultado += `InBody (${ib.length} estudios):\n` + ib.map(e => `  ${e.fecha}: ${e.peso}kg, IMC ${e.imc}, músculo ${e.smm_total}kg (${e.smm_pct}%), grasa ${e.grasa_pct ?? 'N/D'}%`).join('\n') + '\n';
      }
      if (tipo === 'medidas' || tipo === 'todo') {
        const med = cuerpo.medidas || [];
        if (med.length) resultado += `\nMedidas (${med.length} registros):\n` + med.map(m => `  ${m.fecha}: cintura ${m.cintura_ombligo ?? '?'}cm, cadera ${m.cadera ?? '?'}cm, pecho ${m.pecho ?? '?'}cm`).join('\n') + '\n';
      }
      if (tipo === 'checkins' || tipo === 'todo') {
        const ch = (cuerpo.checkins || []).slice(-4);
        if (ch.length) resultado += `\nCheck-ins recientes (${ch.length}):\n` + ch.map(c => `  ${c.fecha}: energía ${c.energia}/5, inflamación ${c.inflamacion}/5, fuerza ${c.fuerza}/5`).join('\n');
      }
      if (!resultado) resultado = 'Sin datos de composición corporal registrados todavía.';
      return { resultado, etiqueta: null };
    }

    case 'guardar_inbody': {
      await guardarInbodyWP(input);
      return { resultado: `InBody del ${input.fecha} guardado. Peso: ${input.peso}kg, músculo: ${input.smm_total ?? 'N/D'}kg.`, etiqueta: `InBody ${input.fecha} guardado ✓` };
    }

    case 'guardar_medidas': {
      await guardarMedidasWP(input);
      return { resultado: `Medidas del ${input.fecha} guardadas.`, etiqueta: `Medidas ${input.fecha} guardadas ✓` };
    }

    case 'guardar_checkin_semanal': {
      await guardarCheckinWP(input);
      return { resultado: `Check-in semanal guardado. Energía: ${input.energia}/5, inflamación: ${input.inflamacion}/5.`, etiqueta: `Check-in guardado ✓` };
    }

    case 'ver_staples': {
      const staples = await getStaplesWP();
      if (!staples.length) return { resultado: 'No hay staples guardados. Puedes agregar con "agrega X a mis staples".', etiqueta: null };
      const lista = staples.map(s => `• ${s.text} (${SHOP_CATS[s.catIndex] || 'Supermercado'})`).join('\n');
      return { resultado: `Staples (${staples.length} artículos base):\n${lista}`, etiqueta: null };
    }

    case 'agregar_staple': {
      const cat = Number(input.catIndex) === 0 ? 0 : 1;
      await agregarStapleWP(input.item, cat);
      return { resultado: `"${input.item}" agregado a staples (${SHOP_CATS[cat]})`, etiqueta: `${input.item} en staples ✓` };
    }

    case 'borrar_staple': {
      await borrarStapleWP(input.item);
      return { resultado: `"${input.item}" eliminado de staples`, etiqueta: `${input.item} quitado de staples` };
    }

    case 'editar_widget': {
      const camposLabel = { wo1: 'workout mañana', wo2: 'workout noche', ha1: 'hábito mañana', ha2: 'hábito noche' };
      await editarWidgetDia(input.dia, input.campo, input.valor);
      const label = camposLabel[input.campo] || input.campo;
      const val = input.valor || '(ninguno)';
      return { resultado: `Widget actualizado: ${label} de ${input.dia} → ${val}`, etiqueta: `Widget: ${label} = ${val}` };
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
      getHistorialReciente(18),
      getGastoCats(),
      getMetodosPago(),
      getContextoDia(),
    ]);

    let dynamicSystem = `## Opciones para gastos del día:\n- Rubros: ${gastoCats.join(', ')}\n- Formas de pago: ${metodosPago.join(', ')}`;
    if (ctxDia) {
      dynamicSystem += `\n\n## Estado actual de Fer (datos en tiempo real):${ctxDia}`;
    }
    if (datos.length > 0) {
      dynamicSystem += '\n\n## Lo que recuerdas de Fernanda (datos importantes guardados):\n'
        + datos.map(d => `- ${d.texto}`).join('\n');
    }
    if (extraCtx) {
      dynamicSystem += '\n\nContexto adicional:\n' + extraCtx;
    }
    const systemBlocks = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicSystem },
    ];

    // Filtrar mensajes del historial donde el bot dijo incorrectamente que no tiene acceso a mapas
    const MAL_INFO_REGEX = /no tengo acceso a (internet|mapas|el mapa)|no puedo buscar restaurantes|no puedo ver.*mapa|no puedo encontrar.*lugar|busca en google maps|abre uber eats|abre rappi.*filtras|los inventé|inventé esos restaurantes/i;
    const historialFiltrado = historial.filter(m => !(m.role === 'assistant' && MAL_INFO_REGEX.test(m.texto)));

    let messages = [
      ...historialFiltrado.map(m => ({ role: m.role, content: m.texto })),
      { role: 'user', content: userMessage },
    ];

    let texto = '';
    for (let i = 0; i < 20; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: systemBlocks,
        tools: TOOLS,
        messages,
      }, { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } });

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
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaHoy = dias[new Date(fechaLocalHoy() + 'T12:00:00').getDay()];
    const entrenamientosHoy = {
      Lunes: 'gym 6am',
      Martes: 'tennis 5am, natación 8am',
      Jueves: 'tennis 5am, natación 8am',
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

bot.onText(/\/staples/, async (msg) => {
  const chatId = msg.chat.id;
  const items = await getStaplesWP();
  if (items.length === 0) {
    await bot.sendMessage(chatId, '📦 No tienes staples guardados todavía.\n\nDile al bot: _"agrega arroz a mis staples de mercado"_ o _"agrega leche a mis staples de supermercado"_', { parse_mode: 'Markdown' });
    return;
  }
  const lista = items.map(i => `• ${i.text} _(${SHOP_CATS[i.catIndex] || 'Supermercado'})_`).join('\n');
  await bot.sendMessage(chatId, `📦 *Tus staples (${items.length}):*\n${lista}\n\nToca el botón para agregarlos todos a tus listas. Luego borra los que ya tengas en casa.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '🛒 Agregar todos a Mercado y Súper', callback_data: 'staples_a_super' }],
    ]},
  });
});

bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const intro = await generarMensajeAutomatico(
    'Genera el encabezado del menú semanal. En 2 líneas máximo: fase del ciclo actual, estrategia energética, días de entrenamiento intenso esta semana. Termina con: "¿Cuántas comidas planeamos?" — NADA MÁS.'
  );
  if (intro) await bot.sendMessage(chatId, intro, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '3', callback_data: 'menu_n_3' }, { text: '4', callback_data: 'menu_n_4' }, { text: '5', callback_data: 'menu_n_5' }],
      [{ text: '6', callback_data: 'menu_n_6' }, { text: '7', callback_data: 'menu_n_7' }, { text: '8', callback_data: 'menu_n_8' }],
    ]},
  });
});

bot.onText(/\/retagrecetas/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '🏷️ Reetiquetando recetas con el nuevo sistema...');
  try {
    const recetas = await getRecetarioWP();
    if (recetas.length === 0) { await bot.sendMessage(chatId, 'No hay recetas.'); return; }

    let actualizadas = 0;
    for (const r of recetas) {
      const prompt = `Eres un experto en nutrición deportiva y salud femenina. Analiza esta receta y asígnale etiquetas de la taxonomía estándar.

RECETA: ${r.nombre}
INGREDIENTES: ${r.ingredientes}
MACROS: proteína ${r.proteina || 'N/D'}, carbos ${r.carbohidratos || 'N/D'}, grasas ${r.grasas || 'N/D'}, calorías ${r.calorias || 'N/D'}
TIPO: ${r.tipo_platillo || 'N/D'}

TAXONOMÍA (usa solo estas):
Momento: pre_gym, post_gym, pre_cardio, post_cardio, pre_natacion, pre_equitacion, desayuno, comida, cena, snack
Ciclo: ideal_folicular, ideal_ovulacion, ideal_lutea_temprana, ideal_lutea_tardia, ideal_menstrual
Propiedades: alta_proteina, alta_fibra, altos_carbos, alta_saciedad, baja_carga_digestiva, antiinflamatoria, comfort_food, ligera
Micronutrientes: hierro, magnesio, omega3, vitamina_c, colageno, electrolitos
Prep: rapida, batch_cooking, sin_coccion, menos_10_min, meal_prep
Energía: alta_energia, recuperacion

Responde SOLO con JSON válido:
{"etiquetas": ["tag1","tag2",...], "fase_ciclo": ["fase1",...], "objetivo_fisiologico": "uno_de_estos"}`;

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });
      const texto = res.content.find(b => b.type === 'text')?.text || '';
      const jsonMatch = texto.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]);

      const ref = wpUser().doc('recetario');
      await wpDb.runTransaction(async t => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const recetas2 = doc.data().recetas || [];
        const idx = recetas2.findIndex(x => x.nombre.toLowerCase().trim() === r.nombre.toLowerCase().trim());
        if (idx < 0) return;
        recetas2[idx] = { ...recetas2[idx], tags: parsed.etiquetas || [], fase_ciclo: parsed.fase_ciclo || [], objetivo_fisiologico: parsed.objetivo_fisiologico || '' };
        t.update(ref, { recetas: recetas2 });
      });
      actualizadas++;
    }
    await bot.sendMessage(chatId, `✅ ${actualizadas}/${recetas.length} recetas reetiquetadas con el nuevo sistema.`);
  } catch (e) {
    console.error('retagrecetas error:', e);
    await bot.sendMessage(chatId, 'Error reetiquetando: ' + e.message);
  }
});

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

  // LOCATION MENU
  } else if (data === 'loc_restaurantes') {
    const loc = _pendingLocation.get(chatId);
    if (!loc) { await bot.sendMessage(chatId, 'La sesión expiró. Manda tu ubicación de nuevo.'); return; }
    _pendingLocation.delete(chatId);
    try { await bot.editMessageText(`📍 *${loc.lugar.split(',')[0]}*\n\n🍽️ Buscando restaurantes...`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }); } catch {}
    const lugares = await buscarLugaresCercanos(loc.lat, loc.lng, 'restaurant', 5000);
    await enviarResultadosLugares(chatId, loc.lat, loc.lng, loc.lugar, lugares, 'restaurantes');

  } else if (data === 'loc_comercio') {
    const loc = _pendingLocation.get(chatId);
    if (!loc) { await bot.sendMessage(chatId, 'La sesión expiró. Manda tu ubicación de nuevo.'); return; }
    userState[chatId] = { modo: 'loc_comercio_query', ...loc };
    try { await bot.editMessageText('🏪 ¿Qué tipo de negocio buscas?\n\n_Ej: farmacia, banco, zapatero, gym, papelería, veterinaria..._', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }); } catch {}

  } else if (data === 'loc_ruta') {
    const loc = _pendingLocation.get(chatId);
    if (!loc) { await bot.sendMessage(chatId, 'La sesión expiró. Manda tu ubicación de nuevo.'); return; }
    userState[chatId] = { modo: 'loc_ruta_query', ...loc };
    try { await bot.editMessageText('🗺️ Lista tus paradas y te armo la ruta optimizada.\n\n_Ej: Banamex, zapatero del Walmart, OXXO_', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }); } catch {}

  } else if (data === 'loc_guardar_lugar') {
    const loc = _pendingLocation.get(chatId);
    if (!loc) { await bot.sendMessage(chatId, 'La sesión expiró. Manda tu ubicación de nuevo.'); return; }
    userState[chatId] = { modo: 'loc_nombre_lugar', ...loc };
    try { await bot.editMessageText(`💾 ¿Cómo se llama este lugar?\n\n_Ej: casa, oficina, casa mamá, gym, casa Fer Avelar..._`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }); } catch {
      await bot.sendMessage(chatId, '💾 ¿Cómo se llama este lugar? (ej: casa, oficina, casa mamá)');
    }

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

  // RECALIBRACIÓN 2PM — botones de decisión
  } else if (data.startsWith('recal_')) {
    const modo = data.replace('recal_', '');
    const instrucciones = {
      construir:   'Fer acaba de elegir CONSTRUIR SU FUTURO para esta tarde. Con base en su Semana Perfecta activa (meta ancla), su energía actual (Garmin) y su fase del ciclo, dale UNA acción concreta, específica y realizable en esta tarde. Si su energía es alta: acción de creación o estrategia. Si es media: ejecución acotada (45 min max). Si es baja: versión mínima o simbólica que igual avanza la meta. Sé directa: "Tu acción de esta tarde es X. Empieza así: [primer paso]." Sin lista, sin opciones — una sola cosa.',
      casa:        'Fer acaba de elegir CUIDAR SU ESPACIO para esta tarde. Revisa sus pendientes y contexto. Sugiere UNA tarea específica de casa realizable en 20-40 minutos — puede ser cocina, lavadora, tender, organizar un espacio, descongelar algo para mañana, preparar ropa del entrenamiento. Que sea concreta: "Haz X. Te toma 25 min y mañana lo agradecerás porque Y." Sin lista.',
      cuidarme:    'Fer acaba de elegir CUIDARSE A SÍ MISMA para esta tarde. Con base en su ciclo, Garmin y hora del día, sugiere UNA acción de autocuidado específica y real: puede ser siesta 20 min, baño con sales, salir a caminar 15 min, yoga suave, jardín con audiolibro, snack específico, estiramientos, acariciar a sus animales. Que sea concreta y caliente: "Lo que tu cuerpo está pidiendo ahora es X. Así se hace: [instrucción breve]."',
      pendientes:  'Fer acaba de elegir CERRAR PENDIENTES para esta tarde. Lee sus pendientes actuales y elige los 2-3 con mayor impacto o que lleven más días sin atención. Para cada uno: nombre + por qué hoy + tiempo estimado. Empieza con el más pequeño para ganar impulso. Formato limpio, accionable. Si alguno tiene mucha fricción, ofrece romperlo en un paso más pequeño.',
    };
    const instruccion = instrucciones[modo];
    if (instruccion) {
      await bot.sendMessage(chatId, '⏳ Un momento...', { parse_mode: 'Markdown' });
      const respuesta = await generarMensajeAutomatico(instruccion);
      if (respuesta) await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    }

  // RECOVERY WINDOW (4pm buttons)
  } else if (data === 'recov_ya_entrene') {
    await bot.sendMessage(chatId, '💪 ¿Qué tipo de entrenamiento?', {
      reply_markup: { inline_keyboard: [
        [{ text: '🏋️ Intenso (gym/natación/tennis)', callback_data: 'recov_intenso' }],
        [{ text: '🧘 Suave (pilates/yoga/caminata)', callback_data: 'recov_suave' }],
        [{ text: '🐴 Equitación', callback_data: 'recov_equitacion' }],
      ]},
    });
  } else if (data.startsWith('recov_')) {
    const modo = data.replace('recov_', '');
    const instrucciones = {
      intenso:    'Fer acaba de confirmar que hizo un entrenamiento INTENSO hoy (gym, natación, tennis o similar). Con base en su Body Battery actual, HRV, estrés y fase del ciclo, genera su Recovery Window: (1) Una línea de diagnóstico honesto de cómo está su cuerpo ahorita. (2) Lo más importante ahora: proteína en los próximos 30-60 min, hidratación, o antiinflamatorio natural según sus datos Garmin y ciclo. (3) UNA acción concreta para las próximas 2 horas que proteja su recuperación muscular y sistema nervioso. Breve, directo.',
      suave:      'Fer acaba de confirmar que hizo ejercicio SUAVE hoy (pilates, yoga, caminata o similar). Con base en su BB, sueño y fase del ciclo, genera su Recovery Window: (1) Una línea de cómo está su sistema — el ejercicio suave suele sumar energía, no restarla. (2) Si su BB es alto: aprovecha la activación para algo creativo o productivo. Si BB bajo: protección del SNS igualmente. (3) UNA acción concreta recomendada. Sin urgencia por recuperación física pesada.',
      equitacion: 'Fer acaba de confirmar que fue a EQUITACIÓN hoy. Es ejercicio físico + mental + emocional intenso. Revisa su BB y ciclo. Genera su Recovery Window: (1) Cómo está su sistema después de montar — fatiga muscular de core y piernas + concentración mental alta. (2) Lo más importante: comer algo completo, hidratarse bien, descomprimir la mente antes de pasar a otras actividades. (3) UNA acción de recuperación específica para las próximas 2 horas. Breve.',
      voy:        'Fer acaba de confirmar que VA A ENTRENAR en un rato. Genera su Pre-Performance Window: (1) Una línea de cómo está su energía ahora (BB, ciclo). (2) Snack e hidratación específicos recomendados ANTES — qué, cuánto y con cuánto tiempo de anticipación según el tipo de entrenamiento que probablemente hará. (3) UNA cosa para activar su sistema sin gastar energía antes de tiempo. Concreta y energizante.',
      noentrene:  'Fer acaba de confirmar que NO entrenó hoy. Con base en su BB, sueño, estrés y fase del ciclo, genera su Recovery Window: si BB bajo, estrés alto o fase menstrual → protección del sistema nervioso (qué evitar, qué hacer suave). Si BB alto → permiso para aprovechar ese impulso con algo activo suave. UNA acción concreta recomendada para las próximas 2 horas. Sin juicio por no haber entrenado.',
    };
    const instruccion = instrucciones[modo];
    if (instruccion) {
      await bot.sendMessage(chatId, '⏳ Un momento...', { parse_mode: 'Markdown' });
      const respuesta = await generarMensajeAutomatico(instruccion);
      if (respuesta) await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    }

  // FOTO → GUARDAR EN RECETARIO
  } else if (data === 'foto_guardar_receta') {
    const analisis = userState[chatId]?.ultimaFotoAnalisis || '';
    if (!analisis) { await bot.sendMessage(chatId, 'No encontré el análisis. Manda la foto de nuevo.'); return; }
    await bot.sendMessage(chatId, '⏳ Guardando en recetario...', { parse_mode: 'Markdown' });
    const instruccion = `Con base en este análisis de foto de comida, guarda la receta en el recetario usando la herramienta guardar_receta. Extrae nombre, ingredientes, tipo de platillo y macros del análisis. Asigna las etiquetas y fase del ciclo correctas según la taxonomía.\n\nAnálisis:\n${analisis}`;
    const respuesta = await generarMensajeAutomatico(instruccion);
    if (respuesta) await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });

  } else if (data === 'foto_solo_log') {
    const analisis = userState[chatId]?.ultimaFotoAnalisis || '';
    await bot.sendMessage(chatId, `✅ Registrado. ${analisis.split('\n')[0]}`);

  // STAPLES → LISTAS DE COMPRAS
  } else if (data === 'staples_a_super') {
    const items = await getStaplesWP();
    if (!items.length) { await bot.sendMessage(chatId, 'No hay staples guardados.'); return; }
    for (const item of items) {
      await agregarItemSuperWP(item.text, item.catIndex);
    }
    await bot.sendMessage(chatId, `✅ ${items.length} staples agregados a tus listas.\n\nBorra los que ya tengas en casa y los que queden son tu lista de compras.`);

  // MENÚ SEMANAL — número de comidas elegido
  } else if (data.startsWith('menu_n_')) {
    const n = parseInt(data.replace('menu_n_', ''));
    await bot.sendMessage(chatId, `⏳ Armando el menú para ${n} comidas...`, { parse_mode: 'Markdown' });
    const instruccion = `Fer quiere planear ${n} comidas para esta semana (desayunos y cenas combinados).

Usa la herramienta ver_recetario para buscar recetas. Filtra por su fase del ciclo actual. Considera también su estrategia energética de la semana y si tiene días de entrenamiento intenso (necesita más proteína esos días).

Reglas para armar el menú:
- Reparte equitativamente entre desayunos y cenas según el número total
- No repitas la proteína principal dos días seguidos (ej: no pollo lunes y martes)
- En días de entrenamiento intenso o post-gym: prioriza recetas con tag alta_proteina o post_gym
- En fase menstrual o lútea tardía: prioriza antiinflamatoria, hierro, comfort_food
- En fase folicular u ovulación: prioriza ligera, alta_energia, variedad
- Incluye opciones rápidas (tag rapida o menos_10_min) para días con más carga

Formato de salida:
📅 *Menú de la semana*
Día — Tipo (desayuno/cena): Nombre receta _(tag relevante)_

Al final una línea breve con los ingredientes clave que probablemente hay que comprar. NADA MÁS después de eso.`;

    const menu = await generarMensajeAutomatico(instruccion);
    if (menu) {
      if (!userState[chatId]) userState[chatId] = {};
      userState[chatId].ultimoMenu = menu;
      await bot.sendMessage(chatId, menu, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🛒 Agregar ingredientes al súper', callback_data: 'menu_a_super' }],
        ]},
      });
    }

  // MENÚ → LISTA DEL SÚPER
  } else if (data === 'menu_a_super') {
    const menu = userState[chatId]?.ultimoMenu || '';
    if (!menu) { await bot.sendMessage(chatId, 'No encontré el menú. Genera uno nuevo con /menu'); return; }
    await bot.sendMessage(chatId, '🛒 Extrayendo ingredientes...', { parse_mode: 'Markdown' });
    const prompt = `Del siguiente menú semanal, extrae SOLO los ingredientes que hay que comprar. Una línea por ingrediente, sin cantidades, sin bullets, sin categorías. Solo el nombre del ingrediente en minúsculas:\n\n${menu}`;
    const ingredientesTexto = await llamarClaude(prompt);
    const items = ingredientesTexto.split('\n').map(i => i.trim()).filter(i => i.length > 2);
    for (const item of items) {
      await agregarItemSuperWP(item, 1); // categoría 1 = Supermercado
    }
    await bot.sendMessage(chatId, `✅ ${items.length} ingredientes agregados al Supermercado:\n${items.join(', ')}`);

  // COMIDA AMBIGUA — fuera o en casa
  } else if (data === 'comida_casa') {
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    const textoOriginal = (userState[chatId] || {}).textoOriginal || 'qué puedo comer';
    userState[chatId] = null;
    await guardarMensajeConversacion('user', textoOriginal);
    const extraCtx = `Fernanda está en casa y quiere ideas de comida. PASOS OBLIGATORIOS:
1. Usa ver_recetario para buscar recetas según su fase del ciclo actual.
2. Si mencionó ingredientes que tiene (en este mensaje o en el historial reciente), cruza con las recetas para ver cuáles puede hacer ahora mismo.
3. Primero muestra las recetas que puede hacer con lo que tiene. Luego, para otras opciones interesantes, lista brevemente qué ingredientes le faltan.
4. Si el recetario está vacío o no hay coincidencias, propón ideas y ofrece guardarlas.`;
    const { texto: respuesta, acciones } = await llamarClaudeConMemoria(textoOriginal, extraCtx);
    await guardarMensajeConversacion('assistant', respuesta);
    let msg = respuesta;
    if (acciones.length > 0) msg += `\n\n_${acciones.join(' · ')}_`;
    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });

  } else if (data === 'comida_fuera') {
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    const textoOriginal = (userState[chatId] || {}).textoOriginal || '';
    userState[chatId] = null;
    const msgPedir = '📍 Comparte tu ubicación y te busco opciones reales cerca de donde estás!';
    if (textoOriginal) _pendingTexto.set(chatId, { timer: setTimeout(() => _pendingTexto.delete(chatId), 180000), texto: textoOriginal });
    await bot.sendMessage(chatId, msgPedir);

  // CHECK-IN 1PM
  } else if (data === 'checkin_si') {
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    const hora = horaLocal();
    const extraCtx = `Son las ${hora}. Fernanda quiere hacer el check-in de mediodía.

Genera un check-in breve y directo:
1. ⚡ Estado actual: Body Battery + ciclo en 1 línea.
2. ☀️ Lo de esta mañana: reconoce lo que sí se hizo (enfoques, tareas). Sin presión.
3. 🎯 UNA prioridad para el resto del día — la más importante.
4. Termina con: "¿Cómo quieres invertir la energía que te queda hoy?"

Máximo 8 líneas. Tono directo y cálido.`;
    const { texto: respuesta } = await llamarClaudeConMemoria('check-in de mediodía', extraCtx);
    await guardarMensajeConversacion('assistant', respuesta);
    await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });

  } else if (data === 'checkin_noche') {
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    await bot.sendMessage(chatId, '🌙 Perfecto, nos vemos en la noche. Cuando quieras cerrar el día dime _"buenas noches"_.', { parse_mode: 'Markdown' });

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
    // BUENOS DÍAS — activa el día y genera brief fresco (solo si el día no fue activado aún)
    const SALUDO_REGEX = /^(buenos?\s+d[ií]as?|buen\s+d[ií]a|buenas?\s+tardes?|hola[,!.\s]|hello[,!.\s]?$|hey[,!.\s]?$|ey[,!.\s]?$|yoo+[,!.\s]?$|oli+[,!.\s]?$|wenas?[,!.\s]?$|qu[eé]\s+(ond[ao]|show|pe[xk]|m[aá]s|tal)[,!.\s]?$|ya\s+(me\s+)?(levant[eé]|despert[eé])|aqu[ií]\s+(ando|estoy)|arrancamos|a\s+darle|v[aá]monos|presente[,!.\s]?$|list[ao][,!.\s]?$)/i;
    if (SALUDO_REGEX.test(texto.trim()) && !diaActivadoHoy(chatId)) {
      activarDia(chatId);
      const hora = horaLocal();
      await guardarMensajeConversacion('user', texto);
      const extraCtx = `Son las ${hora}. Fernanda activó el día con: "${texto}".

Genera el brief del día en DOS BLOQUES separados exactamente por la línea: ---SPLIT---

REGLAS GENERALES:
- Adapta TODO a la hora real (${hora}). No asumas que es de mañana si ya es mediodía o tarde.
- Si el saludo tiene contexto ("ando cansadísima", "tengo mucho trabajo", "estoy de paseo"), adápta el tono y el plan.

BLOQUE 1 — Estado y energía:
Encabezado con el día, fecha y hora real.
🔋 Sueño y energía: Body Battery, horas dormidas, HRV — interpretación honesta.
🌿 Ciclo: fase + qué habilidades tiene hoy amplificadas. 2-3 líneas con profundidad.
✨ Luna: máximo 2 líneas — fase + UNA idea concreta para hoy.
☕ Bebida recomendada: explica por qué según ciclo + Garmin + hora.

---SPLIT---

BLOQUE 2 — Movimiento y plan:
🏊 MOVIMIENTO — LEE ÚNICAMENTE el widget del contexto (sección MOVIMIENTO Y HÁBITOS DE HOY):
  - Si hay workout planificado: escribe sobre ESE específicamente con detalle real.
  - Si NO hay ningún workout: escribe "No tienes entrenamiento planificado hoy. ¿Lo agregamos?" y usa editar_widget si Fernanda te dice qué va a hacer.
  - NUNCA menciones workouts de días anteriores ni asumas ninguna rutina por default.

🥚 Comida: adáptala a la hora real (${hora}). Si ya es tarde, no sugieras desayuno.

🎯 AGENDA Y PENDIENTES — REGLAS ESTRICTAS:
  - SOLO eventos y pendientes de HOY que aún no han pasado (después de las ${hora}).
  - IGNORA cualquier recordatorio de estudios médicos, citas o pendientes que ya mencionaste como hechos en conversaciones anteriores.
  - Si algo ya fue confirmado como hecho por Fernanda (aunque esté en datos guardados), no lo repitas.
  - Los 2-3 más urgentes de HOY únicamente.

⚠️ Solo menciona algo urgente si es específicamente hoy y aún no ha ocurrido.
Cierra con UNA línea específica al momento real. Sin genéricos.`;

      const { texto: respuesta } = await llamarClaudeConMemoria(texto, extraCtx);
      await guardarMensajeConversacion('assistant', respuesta);
      const partes = respuesta.split('---SPLIT---');
      if (partes.length >= 2) {
        await bot.sendMessage(chatId, partes[0].trim(), { parse_mode: 'Markdown' });
        await bot.sendMessage(chatId, partes[1].trim(), { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
      }
      return;
    }

    // BUENAS NOCHES / CIERRE DEL DÍA
    if (/^(buenas?\s+noches?|cierre\s+del\s+d[ií]a|cerramos\s+el\s+d[ií]a)/i.test(texto.trim())) {
      await guardarMensajeConversacion('user', texto);
      const extraCtx = `Fernanda está cerrando el día con: "${texto}".

Genera el cierre nocturno. ESTRUCTURA EXACTA:

1. 💊 Rutina nocturna:
Espironolactona · Magnesio · Minoxidil

2. 🌗 Luna — UNA sola idea, máximo 25 palabras.

3. ✨ Una evidencia real — busca en el contexto UNA cosa concreta que hizo hoy. No motivación vacía. Específica.

4. 🌿 Una línea: lo que más le ayuda a su cuerpo ahora es dormir.

5. Cierre FIJO siempre exactamente:
"Mañana el sistema vuelve a empezar.
Por hoy... ya hiciste suficiente.
Buenas noches, Fer. 🤍"

Sin preguntas. Sin abrir ningún loop. El cierre es el cierre.`;

      const { texto: respuesta } = await llamarClaudeConMemoria(texto, extraCtx);
      await guardarMensajeConversacion('assistant', respuesta);
      await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
      return;
    }

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
    if (estado.modo === 'loc_nombre_lugar') {
      userState[chatId] = null;
      const nombre = texto.trim();
      await guardarUbicacionNombrada(nombre, estado.lat, estado.lng, estado.lugar);
      await bot.sendMessage(chatId, `✅ Guardado: *${nombre}* → ${estado.lugar.split(',')[0]} 📍\n\nPuedo usarlo como origen en tus rutas. Solo di "desde ${nombre}".`, { parse_mode: 'Markdown' });
      return;
    }

    if (estado.modo === 'loc_comercio_query') {
      userState[chatId] = null;
      await bot.sendMessage(chatId, `🔍 Buscando "${texto}" cerca de ti...`);
      const comercios = await buscarComercios(estado.lat, estado.lng, texto, 5000);
      await enviarResultadosLugares(chatId, estado.lat, estado.lng, estado.lugar, comercios, texto);
      return;
    }

    if (estado.modo === 'loc_ruta_query') {
      userState[chatId] = null;
      _pendingLocation.delete(chatId);
      await procesarRuta(chatId, estado.lat, estado.lng, estado.lugar, texto);
      return;
    }

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function buscarLugaresCercanos(lat, lng, tipo = 'restaurant', radioM = 3000) {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radioM}&type=${tipo}&rankby=prominence&key=${apiKey}&language=es`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.log('[places] status:', data.status);
  }

  const mapear = p => {
    const distKm = haversineKm(lat, lng, p.geometry.location.lat, p.geometry.location.lng);
    const distM = Math.round(distKm * 1000);
    return {
      nombre: p.name,
      rating: p.rating ?? null,
      reviews: p.user_ratings_total ?? 0,
      precioNum: p.price_level ?? null,
      precio: p.price_level ? '$'.repeat(p.price_level) : null,
      abierto: p.opening_hours?.open_now ?? null,
      distancia: distM < 1000 ? `${distM}m` : `${(distKm).toFixed(1)}km`,
      caminando: `~${Math.round(distKm * 12)} min`,
      coche: `~${Math.max(1, Math.round(distKm * 2.5))} min`,
    };
  };

  const todos = (data.results || []).map(mapear);
  const usados = new Set();

  const tomar = (filtro, max) => {
    const candidatos = todos
      .filter(r => !usados.has(r.nombre) && filtro(r))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews);
    const elegidos = candidatos.slice(0, max);
    elegidos.forEach(r => usados.add(r.nombre));
    return elegidos;
  };

  // Tier A: 4.5+ estrellas y 50+ reseñas → hasta 4
  const tierA = tomar(r => (r.rating ?? 0) >= 4.5 && r.reviews >= 50, 4);
  // Tier B: 4.0+ estrellas y 100+ reseñas → hasta 3
  const tierB = tomar(r => (r.rating ?? 0) >= 4.0 && r.reviews >= 100, 3);
  // Tier C: 4.5+ estrellas y 10+ reseñas (hidden gems) → hasta 1
  const tierC = tomar(r => (r.rating ?? 0) >= 4.5 && r.reviews >= 10, 1);

  const seleccion = [...tierA, ...tierB, ...tierC];

  // Fallback: si hay menos de 3 resultados, completar con los de mejor rating
  if (seleccion.length < 3) {
    const extras = tomar(r => (r.rating ?? 0) >= 3.5, 8 - seleccion.length);
    return [...seleccion, ...extras];
  }

  return seleccion;
}

// ── LOCATION STATE ─────────────────────────────────────────────────────────
const _pendingTexto = new Map();    // chatId -> { timer, texto }
const _pendingLocation = new Map(); // chatId -> { lat, lng, lugar, timestamp }

// ── HELPERS DE BÚSQUEDA ─────────────────────────────────────────────────────

async function buscarComercios(lat, lng, busqueda, radioM = 5000) {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(busqueda)}&location=${lat},${lng}&radius=${radioM}&key=${apiKey}&language=es`;
  const res = await fetch(url);
  const data = await res.json();
  const mapear = p => {
    const distKm = haversineKm(lat, lng, p.geometry.location.lat, p.geometry.location.lng);
    const distM = Math.round(distKm * 1000);
    return {
      nombre: p.name,
      direccion: (p.formatted_address || '').split(',')[0],
      rating: p.rating ?? null,
      reviews: p.user_ratings_total ?? 0,
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      abierto: p.opening_hours?.open_now ?? null,
      distancia: distM < 1000 ? `${distM}m` : `${(distKm).toFixed(1)}km`,
      caminando: `~${Math.round(distKm * 12)} min`,
      coche: `~${Math.max(1, Math.round(distKm * 2.5))} min`,
    };
  };
  const todos = (data.results || []).map(mapear).sort((a, b) => {
    const ra = (a.rating ?? 3.5); const rb = (b.rating ?? 3.5);
    return (rb * Math.log(b.reviews + 1)) - (ra * Math.log(a.reviews + 1));
  });
  // Filtrar con al menos 4.0 si hay suficientes, sino todos
  const buenos = todos.filter(r => (r.rating ?? 0) >= 4.0);
  return (buenos.length >= 3 ? buenos : todos).slice(0, 8);
}

async function buscarLugarPorNombre(nombre, latBase, lngBase) {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  const query = `${nombre} cerca de Mérida Yucatán`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${latBase},${lngBase}&radius=8000&key=${apiKey}&language=es`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.results.length > 0) {
    const p = data.results[0];
    return { nombre: p.name, lat: p.geometry.location.lat, lng: p.geometry.location.lng, direccion: (p.formatted_address || '').split(',').slice(0, 2).join(',') };
  }
  return null;
}

function optimizarRuta(origen, destinos) {
  const restantes = [...destinos];
  const ruta = [];
  let actual = origen;
  while (restantes.length > 0) {
    let minD = Infinity, minI = 0;
    restantes.forEach((p, i) => { const d = haversineKm(actual.lat, actual.lng, p.lat, p.lng); if (d < minD) { minD = d; minI = i; } });
    ruta.push(restantes[minI]);
    actual = restantes[minI];
    restantes.splice(minI, 1);
  }
  return ruta;
}

async function enviarResultadosLugares(chatId, lat, lng, lugar, lugares, tipoMsg) {
  const MAL_INFO_REGEX = /no tengo acceso a (internet|mapas|el mapa)|no puedo buscar restaurantes|no puedo ver.*mapa|los inventé|inventé esos restaurantes/i;
  const [ctxDia, historial, datos] = await Promise.all([
    getContextoDia().catch(() => ''),
    getHistorialReciente(10).catch(() => []),
    getDatosImportantes().catch(() => []),
  ]);
  const userMsg = `[ubicación: ${lugar}] [busca: ${tipoMsg}]`;
  let systemExtra = '';
  if (datos.length > 0) systemExtra += '\n\n## Lo que recuerdas de Fernanda:\n' + datos.map(d => `- ${d.texto}`).join('\n');
  if (lugares.length > 0) {
    const lista = lugares.map((r, i) => {
      const partes = [`${i + 1}. ${r.nombre}`];
      if (r.rating) partes.push(`⭐${r.rating}${r.reviews ? ` (${r.reviews})` : ''}`);
      if (r.precio) partes.push(r.precio);
      partes.push(r.distancia);
      partes.push(`🚶${r.caminando}`);
      partes.push(`🚗${r.coche}`);
      if (r.abierto === false) partes.push('⚠️ cerrado');
      return partes.join(' | ');
    }).join('\n');
    const esRestaurante = /restaurante|comer|comida/i.test(tipoMsg);
    systemExtra += `\n\n## ${tipoMsg} cercanos (hasta 5km):\n${lista}\n\n`;
    if (esRestaurante) {
      systemExtra += `Presenta resultados en 3 secciones: ⭐ DESTACADOS (4.5+, 50+ reseñas) · ✅ SÓLIDOS (4.0+, 100+ reseñas) · 💎 GEM (4.5+, pocas reseñas). Por cada lugar: nombre, rating, distancia, tiempo caminando/coche, qué pedir según macros. Al inicio: calorías objetivo y cuántas quedan.`;
    } else {
      systemExtra += `Presenta los resultados con nombre, rating, distancia, tiempo caminando/coche. Resalta si están abiertos. Máximo 2 líneas por lugar.`;
    }
  } else {
    systemExtra += `\nNo encontré ${tipoMsg} cercanos. Sugiere alternativas.`;
  }
  const messages = [
    ...historial.filter(m => !(m.role === 'assistant' && MAL_INFO_REGEX.test(m.texto))).map(m => ({ role: m.role, content: m.texto })),
    { role: 'user', content: userMsg },
  ];
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1500,
    system: SYSTEM_PROMPT + (ctxDia ? `\n\n## Estado actual de Fer:${ctxDia}` : '') + systemExtra,
    messages,
  });
  const respuesta = response.content[0]?.text || '';
  await guardarMensajeConversacion('user', userMsg);
  await guardarMensajeConversacion('assistant', respuesta);
  try { await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' }); }
  catch { await bot.sendMessage(chatId, respuesta); }
}

async function procesarRuta(chatId, lat, lng, lugar, textoRuta) {
  await bot.sendMessage(chatId, '🗺️ Buscando tus paradas...');
  const parseRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 150,
    system: 'Extrae los nombres de los lugares a visitar del texto. Devuelve SOLO un JSON array de strings. Ejemplo: ["Banamex","zapatero","Walmart"]. Si no hay lugares, devuelve [].',
    messages: [{ role: 'user', content: textoRuta }],
  });
  let nombres = [];
  try { const p = JSON.parse(parseRes.content[0]?.text || '[]'); if (Array.isArray(p)) nombres = p; } catch { nombres = textoRuta.split(/[,y]\s+/).map(s => s.trim()).filter(s => s.length > 2); }
  if (nombres.length === 0) { await bot.sendMessage(chatId, '🤔 No identifiqué lugares. Escríbelos: "Banamex, zapatero, Walmart"'); return; }

  const resultados = await Promise.all(nombres.map(n => buscarLugarPorNombre(n, lat, lng).catch(() => null)));
  const encontrados = resultados.filter(Boolean);
  const noEncontrados = nombres.filter((_, i) => !resultados[i]);

  if (encontrados.length === 0) { await bot.sendMessage(chatId, '😕 No encontré ningún lugar. Intenta con nombres más específicos.'); return; }

  const rutaOptima = optimizarRuta({ lat, lng }, encontrados);
  const origin = `${lat},${lng}`;
  const last = rutaOptima[rutaOptima.length - 1];
  const intermedias = rutaOptima.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|');
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${last.lat},${last.lng}${intermedias ? `&waypoints=${encodeURIComponent(intermedias)}` : ''}&travelmode=driving`;

  let totalKm = 0; let prev = { lat, lng };
  for (const p of rutaOptima) { totalKm += haversineKm(prev.lat, prev.lng, p.lat, p.lng); prev = p; }

  let msg = `🗺️ *Ruta optimizada desde ${lugar.split(',')[0]}*\n\n`;
  rutaOptima.forEach((p, i) => {
    const desde = i === 0 ? { lat, lng } : rutaOptima[i - 1];
    const d = Math.round(haversineKm(desde.lat, desde.lng, p.lat, p.lng) * 1000);
    msg += `${i + 1}. *${p.nombre}*\n   📍 ${p.direccion} · ${d < 1000 ? `${d}m` : `${(d/1000).toFixed(1)}km`} del anterior\n\n`;
  });
  if (noEncontrados.length > 0) msg += `⚠️ No encontré: ${noEncontrados.join(', ')}\n\n`;
  msg += `📏 Total: ~${totalKm.toFixed(1)} km · ⏱️ ~${Math.round(totalKm * 2.5)} min en coche\n\n`;
  msg += `👇 [Abrir en Google Maps](${mapsUrl})`;

  await guardarMensajeConversacion('user', `[ruta: ${textoRuta}]`);
  await guardarMensajeConversacion('assistant', msg);
  try { await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' }); }
  catch { await bot.sendMessage(chatId, msg.replace(/\*/g, '')); }
}

// ── MESSAGE HANDLER ─────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;

    // Ubicación
    if (msg.location) {
      const { latitude, longitude } = msg.location;
      const pending = _pendingTexto.get(chatId);
      let textoAnterior = '';
      if (pending) { clearTimeout(pending.timer); _pendingTexto.delete(chatId); textoAnterior = pending.texto; }

      try {
        const apiKey = process.env.GOOGLE_MAPS_KEY;
        const geocodeRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=es`).then(r => r.json());
        const lugar = geocodeRes.results?.[0]?.formatted_address || `${latitude}, ${longitude}`;

        // Detectar intención desde texto previo
        const esCasa = /esta es mi casa|es mi casa|mi domicilio|mi dirección|aquí vivo|aquí es mi casa|guardar (ubicacion|este lugar|lugar)|este es .*(casa|trabajo|oficina|gym)/i.test(textoAnterior);
        const esRuta = /ruta|paradas|tengo que ir a|varios lugares|puntos|stops/i.test(textoAnterior);
        const esComercio = textoAnterior && !/restaurante|comer|comida|cenar|almorzar|desayunar/i.test(textoAnterior);

        if (esCasa) {
          userState[chatId] = { modo: 'loc_nombre_lugar', lat: latitude, lng: longitude, lugar };
          await guardarMensajeConversacion('user', `[ubicación a guardar: ${lugar}]`);
          await bot.sendMessage(chatId, `💾 ¿Cómo se llama este lugar?\n\n_Ej: casa, oficina, casa mamá, gym..._`, { parse_mode: 'Markdown' });
          return;
        }

        if (esRuta) {
          await procesarRuta(chatId, latitude, longitude, lugar, textoAnterior);
          return;
        }

        if (esComercio && textoAnterior) {
          // Búsqueda de comercio con texto previo como query
          await bot.sendMessage(chatId, `🔍 Buscando "${textoAnterior}" cerca de ti...`);
          const comercios = await buscarComercios(latitude, longitude, textoAnterior, 5000);
          await enviarResultadosLugares(chatId, latitude, longitude, lugar, comercios, textoAnterior);
          return;
        }

        if (textoAnterior) {
          // Texto previo sobre comida → búsqueda de restaurantes directa
          const lugares = await buscarLugaresCercanos(latitude, longitude, 'restaurant', 5000);
          await enviarResultadosLugares(chatId, latitude, longitude, lugar, lugares, 'restaurantes');
          return;
        }

        // Sin texto previo → mostrar menú
        _pendingLocation.set(chatId, { lat: latitude, lng: longitude, lugar, timestamp: Date.now() });
        await bot.sendMessage(chatId, `📍 *${lugar.split(',')[0]}*\n\n¿Qué necesitas?`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🍽️ Restaurantes', callback_data: 'loc_restaurantes' },
              { text: '🏪 Otro comercio', callback_data: 'loc_comercio' },
            ], [
              { text: '🗺️ Hacer ruta', callback_data: 'loc_ruta' },
              { text: '💾 Guardar ubicación', callback_data: 'loc_guardar_lugar' },
            ]],
          },
        });
      } catch (e) {
        console.error('[location] error:', e.message);
        await bot.sendMessage(chatId, '📍 Recibí tu ubicación pero no pude procesarla.');
      }
      return;
    }

    if (!msg.text || msg.text.startsWith('/')) return;

    const texto = msg.text;
    const existing = _pendingTexto.get(chatId);
    if (existing) clearTimeout(existing.timer);

    // Claramente afuera buscando lugar físico
    const esLocationIntent = /restaurante|cafeter[ií]a|dónde comer|donde comer|dónde hay.*cerca|donde hay.*cerca|comida cerca|lugar cerca|comer cerca|qué hay cerca|que hay cerca|busca.*(restaur|lugar cerca)|encuéntr.*(lugar|restau)|dónde (ir a comer|quedo|puedo comer afuera)/i.test(texto);
    const esRutaIntent = /tengo que ir a|hacer.* ruta|armar.* ruta|optimizar.* ruta|mis paradas|varias paradas|varios lugares|pasos.*(ir|visitar)/i.test(texto);
    // Ambiguo: hambre o antojo genérico — puede ser en casa o afuera
    const esComidaAmbigu = !esLocationIntent && !esRutaIntent && /tengo hambre|qu[eé] (como|puedo comer|me como|comemos)|se me antoja|antojo|quiero comer algo|qu[eé] (hago|preparo|cocino)/i.test(texto);

    if (esRutaIntent) {
      const msgPedir = '📍 Comparte tu ubicación y te armo la ruta optimizada con link a Google Maps!';
      const timer = setTimeout(async () => { _pendingTexto.delete(chatId); await procesarTexto(chatId, texto); }, 180000);
      _pendingTexto.set(chatId, { timer, texto });
      await guardarMensajeConversacion('user', texto);
      await bot.sendMessage(chatId, msgPedir);
      await guardarMensajeConversacion('assistant', msgPedir);
    } else if (esLocationIntent) {
      const msgPedir = '📍 Comparte tu ubicación y te busco opciones reales cerca de donde estás!';
      const timer = setTimeout(async () => { _pendingTexto.delete(chatId); await procesarTexto(chatId, texto); }, 180000);
      _pendingTexto.set(chatId, { timer, texto });
      await guardarMensajeConversacion('user', texto);
      await bot.sendMessage(chatId, msgPedir);
      await guardarMensajeConversacion('assistant', msgPedir);
    } else if (esComidaAmbigu) {
      userState[chatId] = { modo: 'comida_ambigua', textoOriginal: texto };
      await guardarMensajeConversacion('user', texto);
      await bot.sendMessage(chatId, '¿Estás fuera o en casa?', {
        reply_markup: { inline_keyboard: [[
          { text: '🏠 En casa', callback_data: 'comida_casa' },
          { text: '📍 Estoy fuera', callback_data: 'comida_fuera' },
        ]]},
      });
    } else {
      _pendingTexto.delete(chatId);
      await procesarTexto(chatId, texto);
    }
  } catch (e) {
    console.error('[message handler] error:', e.message);
  }
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


bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendChatAction(chatId, 'typing');

    // Descarga la foto en mayor resolución
    const foto = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(foto.file_id);
    const imgRes = await fetch(fileLink);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const caption = msg.caption || '';

    // Inyectar contexto del día (ciclo, Garmin, estrategia)
    const ctxDia = await getContextoDia().catch(() => '');
    const systemConCtx = ctxDia
      ? `${SYSTEM_PROMPT}\n\n## Estado actual de Fer (datos en tiempo real):${ctxDia}`
      : SYSTEM_PROMPT;

    // Claude analiza la imagen
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemConCtx,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `Analiza este plato de comida. ${caption ? `Contexto: "${caption}".` : ''} Ya tienes todos sus datos en el contexto (ciclo, Garmin, estrategia) — NO digas que vas a revisar nada, responde directo.

Responde con este formato (sin tablas markdown, texto simple):
🍽️ *Nombre del platillo*
Ingredientes principales: ...
Proteína ~Xg · Carbos ~Xg · Grasas ~Xg · ~XXX kcal
_(si las porciones son difíciles de ver, da un rango)_
✨ Una línea sobre si encaja con su fase y energía de hoy.

Si no puedes identificar claramente el plato o los ingredientes, NO inventes — pregunta una sola cosa: "¿Qué es esto?" o "¿Puedes decirme qué tiene?" Es mejor preguntar que estimar mal.`,
          },
        ],
      }],
    });

    const analisis = response.content[0]?.text || 'No pude analizar la imagen.';

    if (!userState[chatId]) userState[chatId] = {};
    userState[chatId].ultimaFotoAnalisis = analisis;

    await bot.sendMessage(chatId, `🍽️ ${analisis}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '📖 Guardar en recetario', callback_data: 'foto_guardar_receta' }],
        [{ text: '✅ Solo registrar (sin guardar)', callback_data: 'foto_solo_log' }],
      ]},
    });

    // Guardar en historial para que mensajes siguientes tengan contexto
    await guardarMensajeConversacion('user', `[foto de comida${caption ? ': ' + caption : ''}]`);
    await guardarMensajeConversacion('assistant', analisis);
  } catch (e) {
    console.error('Error analizando foto:', e);
    await bot.sendMessage(chatId, 'No pude analizar la foto. Intenta de nuevo.');
  }
});

// === MENSAJES AUTOMÁTICOS ===

async function generarMensajeAutomatico(instruccion) {
  try {
    const ctx = await getContextoDia();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const fechaMerida = fechaLocalHoy();
    const diaHoy = dias[new Date(fechaMerida + 'T12:00:00').getDay()];
    const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Merida' }).format(new Date());

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
  // 1:00pm L-V — CHECK-IN (solo si Fernanda activó el día con "buenos días")
  cron.schedule('0 13 * * 1-5', async () => {
    try {
      if (!diaActivadoHoy(FERNANDA_CHAT_ID)) return;
      await bot.sendMessage(FERNANDA_CHAT_ID, '👋 ¿Hacemos check-in?', {
        reply_markup: { inline_keyboard: [[
          { text: '✅ Sí', callback_data: 'checkin_si' },
          { text: '🌙 En la noche', callback_data: 'checkin_noche' },
        ]]},
      });
    } catch (e) { console.error('Cron check-in 1pm error:', e); }
  }, { timezone: 'America/Merida' });

  // 8:00pm — RECETARIO (solo si hubo recetas nuevas hoy)
  cron.schedule('0 20 * * *', async () => {
    try {
      const hoy = fechaLocalHoy();
      const recetas = await getRecetarioWP();
      const nuevas = recetas.filter(r => r.fechaGuardada === hoy);
      if (nuevas.length === 0) return;

      const EMOJIS = { pollo: '🍗', res: '🐮', puerco: '🐷', cerdo: '🐷', pescado: '🐟', mariscos: '🦐', huevo: '🥚', vegetariano: '🥗', vegano: '🌱' };
      const grupos = {};
      for (const r of nuevas) {
        const tag = (r.tags || '').toLowerCase();
        const cat = Object.keys(EMOJIS).find(k => tag.includes(k)) || 'otra';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(r.nombre);
      }

      let msg = `📚 *Recetas nuevas de hoy (${nuevas.length}):*\n`;
      for (const [cat, nombres] of Object.entries(grupos)) {
        const emoji = EMOJIS[cat] || '🍽';
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        msg += `\n${emoji} *${label}*\n` + nombres.map(n => `  • ${n}`).join('\n');
      }

      await bot.sendMessage(FERNANDA_CHAT_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Cron recetario 8pm error:', e); }
  }, { timezone: 'America/Merida' });

  console.log('✓ Crons activos: check-in 1pm (L-V) + recetario 8pm');
} else {
  console.log('⚠️ FERNANDA_CHAT_ID no configurado');
}

console.log('🤖 Bot Semana Perfecta v2 iniciado — conectado a Weekly Planner');
// Webhook mode — no polling

// === WEBHOOK HTTP SERVER (para Zapier / integraciones externas) ===

const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';
const PORT = process.env.PORT || 3000;
const _seenUpdates = new Set(); // deduplicar updates de Telegram

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Verificar token de seguridad
  if (WEBHOOK_TOKEN && url.searchParams.get('token') !== WEBHOOK_TOKEN) {
    res.writeHead(401); res.end('Unauthorized'); return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);

      // POST /webhook/telegram — actualizaciones de Telegram
      if (url.pathname === '/webhook/telegram') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        const updateId = payload?.update_id;
        if (updateId && _seenUpdates.has(updateId)) {
          console.log(`[webhook] update_id ${updateId} duplicado, ignorado`);
          return;
        }
        if (updateId) {
          _seenUpdates.add(updateId);
          if (_seenUpdates.size > 200) _seenUpdates.delete(_seenUpdates.values().next().value);
        }
        try { bot.processUpdate(payload); } catch (e) { console.error('[TG webhook] error:', e.message); }
        return;
      }

      // POST /webhook/pinterest — nueva receta desde Zapier
      if (url.pathname === '/webhook/pinterest') {
        // Siempre responder 200 para que Make no desactive el scenario
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        if (!payload.url) {
          console.log('[Pinterest] Pin sin URL (Idea Pin), ignorado.');
          return;
        }
        const pinUrl = payload.url;

        // Procesar en background — silencioso, el resumen llega a las 8pm
        (async () => {
          try {
            const texto = await fetchTextoUrl(pinUrl);
            await llamarClaudeConMemoria(
              `Acabo de guardar este pin de Pinterest: ${pinUrl}\n\nContenido:\n${texto}\n\nExtrae la receta (nombre, ingredientes y pasos completos) y guárdala en el recetario con sus tags. No mandes ningún mensaje de confirmación — el resumen del día se manda a las 8pm.`
            );
            console.log(`[Pinterest] Receta guardada desde ${pinUrl}`);
          } catch (e) {
            console.error('Webhook Pinterest error:', e);
          }
        })();
        return;
      }

      res.writeHead(404); res.end('Unknown endpoint');
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
  });
});

server.listen(PORT, async () => {
  console.log(`🌐 Webhook server escuchando en puerto ${PORT}`);
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) {
    const webhookUrl = `https://${domain}/webhook/telegram${WEBHOOK_TOKEN ? '?token=' + WEBHOOK_TOKEN : ''}`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Telegram webhook registrado: ${webhookUrl}`);
    } catch (e) {
      console.error('❌ Error registrando webhook:', e.message);
    }
  } else {
    console.warn('⚠️  RAILWAY_PUBLIC_DOMAIN no definido — webhook no registrado');
  }
});
