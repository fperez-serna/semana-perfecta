# Mi Semana Perfecta

Herramienta personal de visión de vida y seguimiento de metas. Estética editorial oscura, diseñada para uso diario.

## Cómo correr localmente

```bash
cd semana-perfecta
python3 -m http.server 8080
```

Luego abre `http://localhost:8080` en tu navegador.

> La app funciona abriendo `index.html` directamente para todo excepto la función de IA, que requiere servidor local por las restricciones CORS de la API de Claude.

## Logo

Agrega tu archivo `icon-512.png` en la raíz de la carpeta `semana-perfecta/`. Aparece en la navbar como link al weekly planner.

## API Key de Claude (para acciones con IA)

La app te pide la key la primera vez que presionas "Generar nuevas acciones con IA". Se guarda en `localStorage` de tu navegador — nunca sale de tu computadora.

Puedes obtener tu key en: https://console.anthropic.com/

## Editar tus metas en VS Code

Todos los datos de la semana y las 13 metas viven en `data/metas.json`. Es un JSON estándar, fácil de editar:

- **`semana`** — array de 7 días con `nombre`, `color`, `resumen` y `bloques` (hora + actividad)
- **`metas`** — array de 13 metas, cada una con:
  - `id` — identificador único (snake_case)
  - `nombre` — nombre de la meta
  - `icono` — nombre del ícono en Lucide Icons
  - `tagline` — frase corta
  - `descripcion` — párrafo en prosa
  - `realidadHoy` — estado inicial editable
  - `niveles` — objeto con keys `10`, `5`, `2`, `1`, `6m` (arrays de pasos)
  - `accionesHoy` — array de acciones rápidas

## Agregar un nuevo día a la semana

En `data/metas.json`, dentro del array `semana`, agrega un objeto con este formato:

```json
{
  "nombre": "Nombre del día",
  "color": "#HEXCOLOR",
  "resumen": "Descripción corta del día",
  "bloques": [
    { "hora": "5:00am", "actividad": "Descripción de la actividad" }
  ]
}
```

## Estructura del proyecto

```
semana-perfecta/
├── index.html      — estructura HTML de la app
├── style.css       — todos los estilos
├── app.js          — lógica principal: render, localStorage, interacciones
├── api.js          — integración con Claude API
├── data/
│   ├── metas.json  — los datos de la semana y las 13 metas
│   └── progreso.json — archivo vacío (referencia, estado real en localStorage)
├── icon-512.png    — tu logo (agregar manualmente)
└── README.md
```

El estado de la app vive en `localStorage` del navegador:

| Key | Contenido |
|-----|-----------|
| `progreso_notas_{metaId}` | Texto editable de "Dónde estoy hoy" |
| `meta_{id}_paso_{nivel}_{paso}` | Checkbox completado (boolean) |
| `avances_{metaId}` | Array de avances registrados |
| `ia_acciones_{YYYY-MM-DD}` | Acciones generadas por IA hoy |
| `claude_api_key` | Tu API key de Anthropic |

## Deploy a Netlify (futuro)

1. Crea cuenta en netlify.com
2. Arrastra la carpeta `semana-perfecta/` al dashboard de Netlify
3. Netlify genera una URL pública en segundos

No requiere backend — es 100% frontend estático.
