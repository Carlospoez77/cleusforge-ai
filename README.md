# CleusForge AI

CleusForge es un workspace PWA de chat, contexto y canvas. La aplicación usa Pollinations Text como ruta pública por defecto, por lo que un visitante puede comenzar sin configurar una clave; también puede conectar su propio endpoint compatible con OpenAI desde Ajustes.

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

El servidor escucha en `http://localhost:3000`. Cuando existe `DATABASE_URL`, el backend crea automáticamente las tablas de sesiones anónimas, conversaciones, mensajes, Canvas y archivos de contexto.

## Conectar un proveedor

Completa `OPENROUTER_API_KEY` y, si hace falta, cambia `OPENAI_BASE_URL` y los identificadores `OPENAI_MODEL_*` en `.env`. Las claves del servidor viven únicamente en el backend. Un usuario también puede introducir su clave temporal desde Ajustes; queda almacenada solo en su navegador.

## Build de producción

```bash
npm run build
npm start
```

El `Dockerfile` instala dependencias, compila el frontend y sirve el resultado junto con la API. `render.yaml` deja preparado un Web Service Docker público; consulta [EXTERNAL_DEPLOY.md](EXTERNAL_DEPLOY.md) para conectarlo a tu cuenta y a una base MySQL-compatible externa.

## Alcance de herramientas

La API incluye búsqueda DuckDuckGo, evaluación matemática acotada, Pollinations para texto/imágenes, actualización automática del Canvas y `POST /api/chat/stream` con eventos SSE. El frontend carga Pyodide solo cuando el usuario envía un bloque Python, aislando el cálculo en el navegador y evitando ejecutar código arbitrario en el servidor.
