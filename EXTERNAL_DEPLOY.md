# Despliegue externo e independiente

CleusForge ya no necesita rutas, SDK, cookies ni middleware de Manus para ejecutarse. El paquete contiene un frontend React, un backend Express, streaming SSE y un Dockerfile autocontenido.

## Opción Render

1. Sube este repositorio a tu cuenta de GitHub.
2. En Render, elige **New → Blueprint** y selecciona el repositorio.
3. Render detectará `render.yaml` y creará un Web Service Docker con el plan gratuito.
4. Crea u obtén una URL `DATABASE_URL` de una base MySQL-compatible externa. El servicio crea sus tablas automáticamente al arrancar. Render Free no proporciona una base MySQL persistente dentro del Web Service.
5. Si quieres modelos propios, completa `OPENROUTER_API_KEY`; si lo dejas vacío, la app usa Pollinations Text sin clave y mantiene generación de imágenes por Pollinations.
6. Cuando el servicio termine, Render entregará una URL del tipo `https://<nombre>.onrender.com`. Esa será la URL pública independiente, sin `manus.space` ni inicio de sesión de Manus.

## Variables necesarias

`DATABASE_URL` es recomendable para conservar chats y Canvas entre reinicios. `OPENROUTER_API_KEY` es opcional. `PORT` no debe fijarse manualmente: Render la inyecta y el servidor la respeta.

## Streaming

El cliente usa `POST /api/chat/stream` y recibe eventos Server-Sent Events. El endpoint genera una respuesta completa mediante el proveedor configurado y la entrega progresivamente; con un endpoint compatible que soporte streaming se puede sustituir el adaptador por tokens nativos sin cambiar la interfaz.

## Comprobación después del despliegue

```bash
curl https://TU-DOMINIO.onrender.com/api/health
```

La respuesta debe incluir `ok: true`. Abre la raíz del dominio en una ventana de incógnito: no debe aparecer ninguna redirección a Manus ni pedir login.

## Limitación de acceso actual

No puedo crear un servicio dentro de tu cuenta Render ni obtener una URL `onrender.com` sin que autorices esa cuenta o me proporciones un repositorio/conector externo. El proyecto queda listo para importar; la creación de la cuenta, la base de datos y sus credenciales debe hacerla el propietario del servicio.
