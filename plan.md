# CleusForge AI — Plan de implementación

## Alcance aprobado
Construir una aplicación web pública tipo PWA inspirada en Cleus.AI, con chat oscuro y minimalista, selector de perfiles de modelo, historial lateral, contexto de archivos, memoria de sesión y un lienzo paralelo para código o documentos largos. La primera entrega será funcional con un backend Express, almacenamiento local en memoria como fallback y una capa opcional de proveedor compatible con OpenRouter/OpenAI para conectar modelos mediante variables de entorno.

## Arquitectura
- **Frontend:** React + Vite + TypeScript, con Tailwind CSS configurado y una capa de CSS de producto para el acabado visual.
- **Backend:** Node.js + Express + TypeScript. Sirve el cliente compilado en producción y expone `/api/health`, `/api/chat`, `/api/search` y `/api/files`.
- **Datos:** memoria de proceso para prototipo, con contratos preparados para sustituirse por Supabase/MySQL cuando se conecte una base persistente. No se almacenan claves en el navegador.
- **Agente:** router de perfiles `fast`, `smartest`, `coding` y `agent`. El modo agente puede encadenar herramientas preparadas; en esta base se incluye búsqueda web ligera y un sandbox de cálculo seguro con operaciones acotadas. Las respuestas reales se delegan a un endpoint compatible con OpenAI cuando existe `OPENROUTER_API_KEY`.
- **PWA:** manifest, service worker de cache-first para shell estático y botón de instalación detectado desde el navegador.
- **Despliegue:** Dockerfile autocontenido para publicación como contenedor; también compatible con Render, Railway o una plataforma Node equivalente.

## Diseño
### Tres estilos considerados
1. **Obsidian cockpit / terminal editorial** — probabilidad 0.04.
2. **Paperless studio / documento cálido** — probabilidad 0.06.
3. **Neon research lab / panel experimental** — probabilidad 0.08.

### Estilo elegido: Obsidian cockpit / terminal editorial
- **Movimiento:** una mezcla de estación de trabajo de investigación y editor técnico, con superficies oscuras, bordes finos y acentos ámbar.
- **Principios:** densidad útil, jerarquía tipográfica fuerte, estados visibles y foco en el contenido.
- **Filosofía de color:** carbón y grafito para reducir fatiga; ámbar para decisiones y acciones; verde suave para estados conectados; azul grisáceo para metadatos.
- **Paradigma de layout:** composición asimétrica de tres zonas: navegación estrecha, conversación central y canvas contextual que aparece como segundo plano de trabajo.
- **Elementos firma:** marca circular con símbolo de chispa, píldoras de estado monoespaciadas y línea vertical de actividad que conecta mensajes.
- **Interacción:** cada acción debe responder con un cambio local claro; las selecciones de modelo y contexto son persistentes durante la sesión.
- **Animación:** entradas suaves de 180–240 ms, pulse muy sutil para conexión y expansión del canvas; sin movimientos decorativos constantes.
- **Tipografía:** Inter para lectura y Space Mono para etiquetas técnicas, estados y metadatos.
- **Esencia de marca:** un espacio de trabajo directo para convertir preguntas, archivos y código en decisiones accionables. Personalidad: preciso, sobrio, exploratorio.
- **Voz:** titulares cortos y seguros; microcopy descriptivo, sin relleno. Ejemplos: “Tu siguiente respuesta, con contexto.” / “Abre el lienzo cuando la conversación se vuelva un proyecto.”
- **Wordmark:** “CF” dentro de un anillo incompleto, como una órbita que sugiere contexto en movimiento.
- **Color propio:** ámbar eléctrico `#F7B955`.

## Estructura de carpetas
```text
cleusforge/
├── public/                 # manifest, service worker, iconos y rutas declaradas
├── server/
│   └── index.ts            # Express, router IA y herramientas
├── src/
│   ├── App.tsx             # Shell de producto y estado de la sesión
│   ├── main.tsx            # Bootstrap React + registro PWA
│   └── styles.css          # Tailwind base + sistema visual de la aplicación
├── .env.example            # Variables de proveedores y runtime
├── Dockerfile              # Build y runtime de producción
├── package.json
├── postcss.config.cjs
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── render.yaml             # Servicio externo gratuito opcional
```

## Flujo de entrega
1. Crear el shell de interfaz y contratos de datos.
2. Añadir endpoints y router de modelos con fallback local.
3. Configurar PWA, build y runtime de desarrollo.
4. Ejecutar diagnósticos, build y comprobaciones HTTP.
5. Revisar Preview, corregir defectos y guardar checkpoint en `main`.

## Fase 2 implementada
La ruta pública de IA usa Pollinations Text sin clave como primera opción, con override opcional por API key compatible con OpenAI. El agente ejecuta acciones heurísticas verificables para búsqueda DuckDuckGo, cálculo seguro, generación de imágenes mediante URL Pollinations y escritura del documento `proyecto-agente.md`. El navegador carga Pyodide de forma diferida para ejecutar bloques Python pequeños en el dispositivo del usuario. La base MySQL administrada persiste sesiones anónimas, conversaciones, mensajes, Canvas y archivos de contexto; las consultas validan el vínculo entre sesión y conversación. El cliente recupera la última conversación y Canvas al abrirse y permite ajustar el nivel de pensamiento en `Off`, `Low`, `Medium`, `High` y `Max`.
