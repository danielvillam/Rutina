# Rutina Dashboard

Aplicación web de productividad personal para gestionar actividades diarias, visualizar progreso y mantener una rutina organizada.

**🔗 [rutina-ar3o.onrender.com](https://rutina-ar3o.onrender.com)**

---

## Funcionalidades

- **Dashboard** — Visualiza las actividades del día y márcalas como completadas
- **Barras de progreso** — Seguimiento del avance del día, semana y mes en tiempo real
- **Programación de actividades** — Registra actividades con nombre, fecha, hora de inicio y finalización, categoría y descripción
- **Gestión completa** — Crea, completa y elimina actividades desde cualquier vista
- **Filtros y búsqueda** — En la vista "Todas las actividades" filtra por categoría, estado o texto libre
- **Autenticación segura** — Registro e inicio de sesión con contraseña cifrada; cada usuario solo accede a sus propios datos
- **Sesión persistente** — El token JWT se conserva entre sesiones hasta su expiración

---

## Uso

### 1. Crear una cuenta

Ingresa a la plataforma y selecciona la pestaña **Crear Cuenta**. Elige un nombre de usuario (letras minúsculas, números y `_`, entre 3 y 30 caracteres) y una contraseña de al menos 8 caracteres.

### 2. Dashboard

Al iniciar sesión verás el dashboard con:
- Las **3 barras de progreso** (día / semana / mes) actualizadas automáticamente
- La lista de **actividades de hoy** ordenadas por hora de inicio

Haz clic en el **círculo** a la izquierda de cada actividad para marcarla como completada o revertirla.

### 3. Nueva Actividad

Accede desde la barra lateral o el botón **+ Nueva Actividad** (disponible en todas las vistas). Campos disponibles:

| Campo | Requerido | Descripción |
|---|---|---|
| Nombre | ✅ | Título de la actividad (máx. 80 caracteres) |
| Fecha | ✅ | Día programado |
| Hora de inicio | — | Hora en formato HH:MM |
| Hora de finalización | — | Debe ser posterior a la hora de inicio |
| Categoría | — | General, Salud, Trabajo, Estudio, Personal, Social |
| Descripción | — | Detalle adicional (máx. 500 caracteres) |

### 4. Todas las Actividades

Vista completa con todas las actividades registradas. Permite:
- **Buscar** por nombre o descripción
- **Filtrar** por categoría y por estado (pendiente / completada)
- **Eliminar** cualquier actividad con el botón 🗑

---

## Construcción

### Arquitectura

```
Frontend (HTML + CSS + JS vanilla)
        │
        │ HTTP/REST (JSON)
        ▼
Backend (Node.js + Express)
        │
        │ Mongoose ODM
        ▼
Base de datos (MongoDB Atlas)
```

El frontend es servido como archivos estáticos por el propio servidor Express, por lo que toda la aplicación corre en un único proceso Node.js.

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES2022 (vanilla) |
| Backend | Node.js, Express 4 |
| Base de datos | MongoDB Atlas (Mongoose ODM) |
| Autenticación | JSON Web Tokens (JWT) |
| Cifrado | bcryptjs (salt rounds: 12) |
| Seguridad HTTP | Helmet, express-rate-limit, CORS |
| Despliegue | Render (Web Service) |

### Estructura del proyecto

```
Dashboard_Rutina/
├── index.html          # Interfaz principal (SPA)
├── styles.css          # Sistema de diseño dark-mode
├── app.js              # Lógica frontend + llamadas a la API
└── backend/
    ├── server.js       # Servidor Express (entry point)
    ├── config/
    │   └── db.js       # Conexión a MongoDB Atlas
    ├── middleware/
    │   └── auth.js     # Verificación de JWT
    ├── models/
    │   ├── User.js     # Modelo de usuario
    │   └── Activity.js # Modelo de actividad
    ├── routes/
    │   ├── auth.js     # POST /register, POST /login, GET /me
    │   └── activities.js # CRUD /activities
    ├── .env.example    # Plantilla de variables de entorno
    └── package.json
```

### Esquema de datos (MongoDB)

**Colección `users`**
```json
{
  "_id": "ObjectId",
  "username": "string (único, minúsculas, 3-30 chars)",
  "passwordHash": "string (bcrypt, nunca expuesto en respuestas)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Colección `activities`**
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (referencia al usuario propietario)",
  "name": "string (máx 80)",
  "date": "string YYYY-MM-DD",
  "timeStart": "string HH:MM",
  "timeEnd": "string HH:MM",
  "category": "general | salud | trabajo | estudio | personal | social",
  "description": "string (máx 500)",
  "done": "boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### API REST

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Crear cuenta | — |
| POST | `/api/auth/login` | Iniciar sesión | — |
| GET | `/api/auth/me` | Verificar sesión activa | JWT |
| GET | `/api/activities` | Listar actividades del usuario | JWT |
| POST | `/api/activities` | Crear actividad | JWT |
| PATCH | `/api/activities/:id` | Actualizar actividad | JWT |
| DELETE | `/api/activities/:id` | Eliminar actividad | JWT |

### Seguridad

- Contraseñas cifradas con **bcrypt** (never stored in plain text)
- **JWT** con expiración configurable (por defecto 7 días)
- **Rate limiting**: 200 req/15min general · 20 req/15min en `/auth`
- **Helmet** configura cabeceras HTTP seguras (CSP, HSTS, etc.)
- Sanitización de inputs contra inyección NoSQL
- Aislamiento de datos: cada usuario solo puede leer y modificar sus propias actividades

---

## Ejecución local

```bash
# 1. Clonar el repositorio
git clone https://github.com/danielvillam/Rutina.git
cd Rutina/backend

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Edita .env con tu URI de MongoDB Atlas y tu JWT secret

# 4. Iniciar el servidor
node server.js
# → http://localhost:3000
```

---

## Despliegue (Render)

El proyecto está configurado para desplegarse en [Render](https://render.com) como **Web Service**:

- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Variables de entorno:** `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV=production`
