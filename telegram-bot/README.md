# Bot Semana Perfecta — Telegram

Bot personal de Fernanda conectado a Firebase Firestore. Registra avances, journal, lista del súper, acciones del día y más — sincronizado en tiempo real con la app web.

## Setup en 5 pasos

### 1. Service Account de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com) → tu proyecto `semana-perfecta`
2. Engrane (⚙️) → **Project Settings** → pestaña **Service accounts**
3. Clic en **Generate new private key** → descarga el JSON
4. Abre el JSON y copia los valores de:
   - `client_email`
   - `private_key`

### 2. Variables de entorno

Crea un archivo `.env` en esta carpeta (copia de `.env.example`):

```
TELEGRAM_TOKEN=tu_token_aquí
CLAUDE_API_KEY=sk-ant-...
FERNANDA_CHAT_ID=    (lo obtienes al enviar /start al bot)
FIREBASE_PROJECT_ID=semana-perfecta
FIREBASE_CLIENT_EMAIL=el_client_email_del_json
FIREBASE_PRIVATE_KEY="el_private_key_del_json_completo_con_las_comillas"
```

> **Importante:** La `FIREBASE_PRIVATE_KEY` debe ir entre comillas dobles y con los `\n` del salto de línea tal como está en el JSON.

### 3. Obtener tu Chat ID

1. Instala dependencias: `npm install`
2. Corre el bot: `node index.js`
3. Abre Telegram y envía `/start` al bot
4. El bot te muestra tu Chat ID — cópialo en `.env` como `FERNANDA_CHAT_ID`
5. Reinicia el bot

### 4. Reglas de Firestore

En Firebase Console → Firestore → **Rules**, pega esto temporalmente para desarrollo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 5. Correr localmente

```bash
cd telegram-bot
npm install
node index.js
```

---

## Deploy en Render

1. Sube el repo a GitHub (ya está en `fperez-serna/semana-perfecta`)
2. Ve a [render.com](https://render.com) → **New Web Service**
3. Conecta el repo de GitHub
4. Configuración:
   - **Root directory:** `telegram-bot`
   - **Build command:** `npm install`
   - **Start command:** `node index.js`
5. En **Environment Variables** agrega todas las variables del `.env`
6. Deploy

---

## Comandos

| Comando | Función |
|---------|---------|
| `/start` | Saludo y menú principal |
| `/menu` | Muestra el menú con botones |
| `/journal` | Modo escritura libre — el bot responde con empatía y lógica |
| `/metas` | Lista las 13 metas y sus notas |
| `/avance` | Registra un avance en una meta específica |
| `/acciones` | Genera 3 acciones concretas para hoy con IA |
| `/super` | Gestiona la lista del súper |
| `/recetas` | Genera 3 recetas sanas altas en proteína |
| `/como` | Check-in emocional — responde con empatía real |
| `/progreso` | Resumen de la semana con IA |

## Detección automática de keywords en journal

Cuando escribes en modo `/journal`, el bot detecta:

| Palabra | Acción |
|---------|--------|
| tennis, gym, natación, pilates, equitación | Guarda en colección `entrenamientos` |
| atlas, caballo | Guarda en `entrenamientos` + avance en meta Granja |
| instagram, tiktok, redes, scroll, celular | Guarda en colección `consciencia` |
| bug, app, planner, código, deploy | Avance en meta Tecnología |
| mamá | Respuesta con empatía extra |

## Mensajes automáticos

| Hora | Días | Mensaje |
|------|------|---------|
| 8:50am | Lun–Vie | Buenos días + pregunta de trabajo |
| 10:25am | Lun–Vie | Cierre de bloque profundo |
| 12:55pm | Lun–Vie | Cierre de mañana |
| 9:00pm | Todos | Check-in nocturno |
| 7:00pm | Domingo | Recordatorio de progreso semanal |

Zona horaria: `America/Merida`

## Agregar nuevas keywords de detección

En `index.js`, función `detectarYRegistrar()`, agrega el keyword al array correspondiente y define la acción (qué colección, qué metaId).

## Agregar un nuevo comando

1. Crea la función `async function miComando(chatId) { ... }`
2. Registra con `bot.onText(/\/micomando/, (msg) => miComando(msg.chat.id))`
3. Agrega botón al `menuKeyboard()` si aplica
4. Maneja el callback en `bot.on('callback_query', ...)`
