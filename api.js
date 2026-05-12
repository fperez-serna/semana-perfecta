async function generateDailyActions(metas, progreso) {
  const apiKey = localStorage.getItem('claude_api_key');
  if (!apiKey) throw new Error('No hay API key configurada.');

  const progresoResumen = progreso
    .map(p => `- ${p.nombre}: ${p.completados} de ${p.total} pasos completados`)
    .join('\n');

  const userMessage = `Mi progreso actual en las 13 metas:
${progresoResumen}

Elige las 3 metas más urgentes o con menor progreso y dame 1 acción específica, gratuita y realizable HOY para cada una.

Responde SOLO en este formato JSON, sin texto adicional ni markdown:
[
  {"meta": "Nombre exacto de la meta", "accion": "Acción específica a realizar hoy"},
  {"meta": "Nombre exacto de la meta", "accion": "Acción específica a realizar hoy"},
  {"meta": "Nombre exacto de la meta", "accion": "Acción específica a realizar hoy"}
]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Eres un coach de vida que conoce profundamente a esta persona.
Ella vive en Mérida, México. Tiene deuda de tarjeta que está pagando.
Cuida a su mamá que tiene una discapacidad.
Ya hace tennis martes y jueves 5am, natación martes y jueves 8am, gym los lunes 6am.
Está aprendiendo AI, automatizaciones y vibe coding.
Tiene un weekly planner app casi lista para lanzar.
Tiene un caballo llamado Atlas de 2 años.
Su mayor reto es dejar el scroll de redes sociales y ser más consistente.
Genera acciones pequeñas, gratuitas, específicas y realizables HOY.
Responde siempre en español. Solo JSON puro, sin markdown ni explicaciones.`,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Error ${response.status} de la API de Claude.`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    throw new Error('No se pudo parsear la respuesta de la IA. Intenta de nuevo.');
  }
}
