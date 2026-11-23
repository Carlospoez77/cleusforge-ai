# CleusForge AI — Resultados

## 1. Shell PWA de chat y navegación
- [x] La aplicación se sirve como web pública con una interfaz oscura, minimalista y responsive.
- [x] La interfaz incluye chat principal, selector de modelos desplegable, barra lateral de historial, soporte de archivos como contexto, memoria de sesión y un Lienzo/CVS paralelo para código o documentos largos.
- [x] La aplicación incluye manifest PWA, service worker y una acción visible para instalarla cuando el navegador lo permite.

## 2. Router de perfiles de modelo
- [x] El selector ofrece los perfiles Modo Rápido (Fast), Razonamiento Profundo (Smartest), Codificación (Coding) y Agente Autónomo.
- [x] El backend conecta Pollinations Text como proveedor público por defecto, permite proveedores compatibles con OpenAI mediante variables de entorno y conserva un fallback local si el proveedor falla.
- [x] Los prompts del sistema son directos y objetivos, manteniendo límites de seguridad para contenido ilegal, daño físico, explotación sexual de menores y ciberataques maliciosos.

## 3. Agente y herramientas base
- [x] El backend expone un ciclo de agente por pasos y registra herramientas de búsqueda web, ejecución matemática segura, sandbox Python Pyodide bajo demanda y generación multimedia con Pollinations.
- [x] El chat envía mensajes al backend y muestra actividad del agente, eventos de herramientas, imágenes generadas y actualizaciones del Canvas.
- [x] La subida/lectura de TXT, CSV, código y texto extraído de documentos queda representada en el contexto de la sesión y visible para el usuario.

## 4. Despliegue independiente
- [x] El repositorio contiene `.env.example` con las variables para proveedor compatible con OpenAI/OpenRouter y URLs de búsqueda.
- [x] El proyecto incluye Dockerfile y scripts de build/start reproducibles para publicar como servicio Node.
- [x] Existe una configuración `render.yaml` para publicar frontend y backend como un único servicio externo.

## 5. Verificación y entrega
- [x] TypeScript y JavaScript tienen diagnósticos registrados en Webdev.
- [x] El build de producción termina correctamente y el servidor responde en `/api/health`.
- [x] Guardar el checkpoint de la Fase 2 en el repositorio canónico después de completar la validación final.

## Fase 2 — entregado en esta iteración

- [x] Proveedor público Pollinations Text integrado como ruta sin API key y API key opcional por navegador para OpenRouter/endpoint compatible.
- [x] Nivel visual de razonamiento Off, Low, Medium, High y Max integrado en Ajustes y enviado al router.
- [x] Búsqueda DuckDuckGo, actualización automática del Canvas y generación de URL de imagen Pollinations integradas en el modo Agente.
- [x] Sesión anónima persistente mediante cookie y tablas MySQL para conversaciones, mensajes, Canvas y archivos de contexto.
- [x] Pyodide configurado como sandbox Python de carga diferida para bloques Markdown con código Python.

## Pendientes opcionales

- [ ] Añadir login externo opcional, manteniendo siempre el acceso anónimo sin fricción.
- [x] Añadir streaming SSE/token a token para que las respuestas largas aparezcan progresivamente.
- [ ] Sustituir el DDL de arranque por migraciones versionadas y añadir versionado de documentos del Canvas.

## Desacoplamiento externo

- [x] Eliminar rutas, metadatos, SDK, middleware y redirecciones específicas de Manus del runtime de la aplicación.
- [x] Añadir `/api/chat/stream` con eventos SSE y cliente que renderiza tokens progresivamente.
- [ ] Conectar el repositorio a la cuenta externa del usuario y completar la creación del servicio Render; requiere autorización/credenciales del usuario.
