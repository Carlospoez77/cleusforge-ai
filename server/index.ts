import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import mysql, { type Pool } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isCompiled = path.basename(path.resolve(__dirname, '..')) === 'dist-server';
const rootDir = isCompiled ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const generatedDir = path.join(process.cwd(), 'generated');
fs.mkdirSync(generatedDir, { recursive: true });

type Profile = 'fast' | 'smartest' | 'coding' | 'agent';
type ChatItem = { role: 'user' | 'assistant' | 'system'; content: string };
type ContextItem = { name: string; content: string; size?: string; type?: string };
type RequestWithSession = Request & { sessionId?: string };

const profileConfig: Record<Profile, { label: string; model?: string; system: string }> = {
  fast: { label: 'Modo Rápido', model: process.env.OPENAI_MODEL_FAST, system: 'Responde de forma breve, clara y accionable. Evita rodeos.' },
  smartest: { label: 'Razonamiento Profundo', model: process.env.OPENAI_MODEL_SMARTEST, system: 'Analiza supuestos y alternativas. Responde de forma objetiva, directa y sin sermones genéricos.' },
  coding: { label: 'Codificación', model: process.env.OPENAI_MODEL_CODING, system: 'Actúa como ingeniero senior. Da código reproducible, pruebas y mitigaciones de seguridad.' },
  agent: { label: 'Agente Autónomo', model: process.env.OPENAI_MODEL_AGENT, system: 'Actúa como un agente autónomo práctico. Entiende el objetivo, divide el trabajo en pasos, usa las herramientas disponibles cuando aporten valor y entrega una respuesta concreta y ejecutable. No te limites a describir lo que podrías hacer: realiza el trabajo dentro de tus capacidades y distingue con claridad lo que sí ejecutaste de lo que requiere una acción externa.' },
};
const safeGuardrail = 'Respeta la ley y no ayudes a explotar menores, causar violencia extrema, fabricar armas o ejecutar ciberataques maliciosos. Para seguridad informática legítima, ofrece análisis defensivo y mitigaciones.';
let pool: Pool | null = null;

const makeId = () => crypto.randomBytes(16).toString('hex');
const now = () => new Date();
const memory = {
  conversations: new Map<string, { id: string; sessionId: string; title: string; updatedAt: string }>(),
  canvas: new Map<string, { id: string; sessionId: string; name: string; content: string; updatedAt: string }>(),
};
const rateLimits = new Map<string, { startedAt: number; count: number }>();

async function initDatabase() {
  if (!process.env.DATABASE_URL) return;
  try {
    pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5, ssl: { rejectUnauthorized: false } });
    await pool.query(`CREATE TABLE IF NOT EXISTS cf_sessions (id VARCHAR(64) PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cf_conversations (id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64) NOT NULL, title VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(session_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cf_messages (id VARCHAR(64) PRIMARY KEY, conversation_id VARCHAR(64) NOT NULL, role VARCHAR(20) NOT NULL, content MEDIUMTEXT NOT NULL, model VARCHAR(40), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(conversation_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cf_canvas (id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, content MEDIUMTEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY(session_id, name))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cf_context_files (id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, size_label VARCHAR(32), mime_type VARCHAR(120), content MEDIUMTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(session_id))`);
    console.log('CleusForge database ready');
  } catch (error) {
    console.warn('Database unavailable; using session fallback:', (error as Error).message);
    pool = null;
  }
}

async function db(sql: string, values: unknown[] = []) {
  if (!pool) return null;
  try {
    const [result] = await pool.query(sql, values);
    return result as mysql.RowDataPacket[];
  } catch (error) {
    console.warn('Database query failed:', (error as Error).message);
    return null;
  }
}

function parseCookies(request: Request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map((value) => value.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

async function sessionMiddleware(request: RequestWithSession, response: Response, next: NextFunction) {
  const cookies = parseCookies(request);
  const sessionId = String(request.headers['x-cleus-session'] || cookies.cf_session_id || makeId());
  request.sessionId = sessionId;
  if (!cookies.cf_session_id) response.setHeader('Set-Cookie', `cf_session_id=${sessionId}; Path=/; Max-Age=31536000; SameSite=None; Secure`);
  await db('INSERT INTO cf_sessions (id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP', [sessionId]);
  next();
}

async function getConversation(sessionId: string, requestedId?: string) {
  if (requestedId) {
    const owned = await db('SELECT id FROM cf_conversations WHERE id = ? AND session_id = ? LIMIT 1', [requestedId, sessionId]);
    if (owned?.[0]) return requestedId;
    const local = memory.conversations.get(requestedId);
    if (local?.sessionId === sessionId) return requestedId;
  }
  const rows = await db('SELECT id FROM cf_conversations WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1', [sessionId]);
  const existing = rows?.[0] as { id?: string } | undefined;
  if (existing?.id) return existing.id;
  const id = makeId();
  await db('INSERT INTO cf_conversations (id, session_id, title) VALUES (?, ?, ?)', [id, sessionId, 'Diseño del agente autónomo']);
  memory.conversations.set(id, { id, sessionId, title: 'Diseño del agente autónomo', updatedAt: now().toISOString() });
  return id;
}

async function persistMessage(sessionId: string, conversationId: string, item: ChatItem, model: Profile) {
  await db('INSERT INTO cf_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)', [makeId(), conversationId, item.role, item.content, model]);
  if (!pool) memory.conversations.set(conversationId, { id: conversationId, sessionId, title: item.content.slice(0, 44), updatedAt: now().toISOString() });
  await db('UPDATE cf_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [conversationId]);
}

async function callCompatibleProvider(profile: Profile, messages: ChatItem[], context: ContextItem[], providerKey?: string, providerBaseUrl?: string, requestedModel?: string) {
  const apiKey = providerKey || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (providerBaseUrl || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  if (!apiKey) return null;
  const contextBlock = context.length ? `\n\nContexto adjunto:\n${context.map((item) => `### ${item.name}\n${item.content}`).join('\n\n')}` : '';
  const response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: requestedModel || profileConfig[profile].model || process.env.LLM_MODEL || 'dolphin-mistral-24b-venice-edition', messages: [{ role: 'system', content: `${profileConfig[profile].system}\n${safeGuardrail}${contextBlock}` }, ...messages.slice(-18)], temperature: profile === 'fast' ? 0.5 : 0.3 }) });
  if (!response.ok) throw new Error(`Proveedor IA respondió ${response.status}.`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || null;
}

async function callPollinations(profile: Profile, messages: ChatItem[], context: ContextItem[], thoughtLevel = 'medium') {
  const latest = messages.slice(-8).map((item) => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
  const contextBlock = context.length ? `\nARCHIVOS:\n${context.map((item) => `${item.name}: ${item.content.slice(0, 6000)}`).join('\n')}` : '';
  const prompt = `Eres CleusForge y trabajas en español salvo que la persona pida otro idioma. Perfil: ${profileConfig[profile].label}. Nivel de pensamiento: ${thoughtLevel}. ${profileConfig[profile].system} ${safeGuardrail}\nReglas de ejecución: responde directamente a la última solicitud; para tareas legítimas y permitidas, intenta resolverlas en lugar de contestar con una negativa vaga; no inventes herramientas, resultados ni acceso a cuentas; si una acción no está disponible, ofrece el siguiente paso concreto. No incluy mensajes promocionales sobre conectar una API key.\n${latest}${contextBlock}\nASSISTANT:`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&seed=${Math.floor(Math.random() * 100000)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CleusForge/0.2' } });
  if (!response.ok) throw new Error(`Pollinations respondió ${response.status}.`);
  const text = (await response.text()).trim();
  return text || null;
}

async function searchWeb(query: string) {
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(endpoint, { headers: { 'User-Agent': 'CleusForge/0.2' } });
  if (!response.ok) throw new Error('Búsqueda no disponible.');
  const data = (await response.json()) as { AbstractText?: string; AbstractURL?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
  return { abstract: data.AbstractText || 'No se encontró un resumen directo.', url: data.AbstractURL, related: (data.RelatedTopics || []).slice(0, 4).map((item) => ({ text: item.Text, url: item.FirstURL })).filter((item) => item.text) };
}

async function readWebpage(target: string) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se pueden leer URLs HTTP o HTTPS.');
  const response = await fetch(url, { headers: { 'User-Agent': 'CleusForge/0.3' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`La página respondió ${response.status}.`);
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 18_000);
}

async function executeCode(language: 'python' | 'javascript', code: string) {
  if (!code.trim() || code.length > 20_000) throw new Error('El código está vacío o supera el límite de 20.000 caracteres.');
  const piston = await fetch('https://emkc.org/api/v2/piston/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: language === 'javascript' ? 'javascript' : 'python', version: '*', files: [{ content: code }] }), signal: AbortSignal.timeout(12_000) });
  if (piston.ok) {
    const data = await piston.json() as { run?: { stdout?: string; stderr?: string } };
    return `${data.run?.stdout || ''}${data.run?.stderr ? `\n${data.run.stderr}` : ''}`.trim().slice(0, 20_000);
  }
  return new Promise<string>((resolve, reject) => {
    const child = spawn(language === 'javascript' ? 'node' : 'python3', language === 'javascript' ? ['--max-old-space-size=128', '-e', code] : ['-I', '-c', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('La ejecución superó los 10 segundos.')); }, 10_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', () => { clearTimeout(timer); resolve(output.trim().slice(0, 20_000)); });
  });
}

async function createFile(name: string, content: string) {
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'resultado.txt';
  const finalName = `${Date.now()}-${safeName}`;
  fs.writeFileSync(path.join(generatedDir, finalName), content.slice(0, 200_000), 'utf8');
  return { name: safeName, url: `/generated/${finalName}` };
}

function localReply(profile: Profile, prompt: string, context: ContextItem[]) {
  const contextLine = context.length ? `\n\nHe tenido en cuenta ${context.length} archivo${context.length > 1 ? 's' : ''}: ${context.map((item) => item.name).join(', ')}.` : '';
  return profile === 'agent'
    ? `He recibido tu solicitud: “${prompt.slice(0, 160)}${prompt.length > 160 ? '…' : ''}”.\n\nPuedo trabajarla como agente: primero fijo el objetivo, después ejecuto las acciones disponibles y finalmente te entrego el resultado y las verificaciones.${contextLine}\n\nPara tareas que necesiten acceso a una cuenta, archivos externos o un servicio privado, te indicaré exactamente qué paso queda pendiente.`
    : `El router ${profileConfig[profile].label} está activo. Para “${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}”, puedo dividir el trabajo en objetivo, contexto, ejecución y verificación.${contextLine}`;
}

function safeMath(expression: string) {
  if (!expression || expression.length > 500 || !/^[0-9+\-*/().,%\s]+$/.test(expression)) throw new Error('Solo se permiten expresiones matemáticas acotadas.');
  return Function(`"use strict"; return (${expression})`)();
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(sessionMiddleware);

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'cleusforge-api', provider: Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY), database: Boolean(pool), timestamp: new Date().toISOString() }));
app.get('/api/models', (_request, response) => response.json(Object.entries(profileConfig).map(([id, profile]) => ({ id, label: profile.label, model: profile.model || 'pollinations-public' }))));
app.post('/api/execute', async (request: Request, response: Response) => {
  const body = request.body as { language?: 'python' | 'javascript'; code?: string };
  if (body.language !== 'python' && body.language !== 'javascript') return response.status(400).json({ error: 'language debe ser python o javascript.' });
  try { return response.json({ ok: true, output: await executeCode(body.language, String(body.code || '')) }); } catch (error) { return response.status(502).json({ error: (error as Error).message }); }
});

app.get('/api/session', async (request: RequestWithSession, response) => {
  const sessionId = request.sessionId!;
  const conversations = await db('SELECT id, title, updated_at AS updatedAt FROM cf_conversations WHERE session_id = ? ORDER BY updated_at DESC LIMIT 30', [sessionId]) || Array.from(memory.conversations.values()).filter((item) => item.sessionId === sessionId).map(({ sessionId: _sessionId, ...item }) => item);
  const canvas = await db('SELECT id, name, content, updated_at AS updatedAt FROM cf_canvas WHERE session_id = ? ORDER BY updated_at DESC', [sessionId]) || Array.from(memory.canvas.values()).filter((item) => item.sessionId === sessionId).map(({ sessionId: _sessionId, ...item }) => item);
  response.json({ sessionId, persistent: Boolean(pool), conversations, canvas });
});

app.get('/api/conversations/:id/messages', async (request: RequestWithSession, response: Response) => {
  const rows = await db('SELECT m.role, m.content, m.model, m.created_at AS createdAt FROM cf_messages m INNER JOIN cf_conversations c ON c.id = m.conversation_id WHERE m.conversation_id = ? AND c.session_id = ? ORDER BY m.created_at ASC', [request.params.id, request.sessionId]);
  response.json({ messages: rows || [] });
});

app.post('/api/chat/stream', async (request: RequestWithSession, response: Response) => {
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();
  try {
    const upstream = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cleus-session': request.sessionId! },
      body: JSON.stringify(request.body),
    });
    const payload = await upstream.json() as { answer?: string; [key: string]: unknown };
    if (!upstream.ok) throw new Error(String(payload.error || 'El router rechazó la solicitud.'));
    const answer = String(payload.answer || '');
    response.write(`event: status\ndata: ${JSON.stringify({ status: 'connected', provider: payload.provider })}\n\n`);
    const tokens = answer.match(/\S+\s*/g) || [];
    for (const token of tokens) {
      response.write(`event: token\ndata: ${JSON.stringify({ delta: token })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    response.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch (error) {
    response.write(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
  } finally {
    response.end();
  }
});

app.post('/api/chat', async (request: RequestWithSession, response: Response) => {
  const sessionRate = rateLimits.get(request.sessionId!);
  const rateNow = Date.now();
  if (!sessionRate || rateNow - sessionRate.startedAt > 60_000) rateLimits.set(request.sessionId!, { startedAt: rateNow, count: 1 });
  else if (sessionRate.count >= 30) return response.status(429).json({ error: 'Límite temporal alcanzado. Espera un minuto.' });
  else sessionRate.count += 1;
  const body = request.body as { model?: Profile; messages?: ChatItem[]; context?: ContextItem[]; providerKey?: string; providerBaseUrl?: string; requestedModel?: string; thoughtLevel?: string; conversationId?: string };
  const profile = body.model && body.model in profileConfig ? body.model : 'agent';
  const safeMessages = (body.messages || []).filter((item) => item && (item.role === 'user' || item.role === 'assistant')).slice(-20);
  const context = Array.isArray(body.context) ? body.context.slice(0, 8) : [];
  const lastUserMessage = ([...safeMessages].reverse().find((item) => item.role === 'user')?.content || '').slice(0, 20_000);
  const events: Array<{ label: string; status: string }> = [];
  let image: string | undefined;
  let canvas: { name: string; content: string } | undefined;
  try {
    let enrichedMessages = safeMessages;
    if (profile === 'agent' && /\b(web|internet|actual|actualizado|investiga|fuentes|noticias|buscar)\b/i.test(lastUserMessage)) {
      events.push({ label: 'Búsqueda web', status: 'completed' });
      const results = await searchWeb(lastUserMessage);
      enrichedMessages = [...safeMessages, { role: 'system', content: `Resultados web actuales:\n${results.abstract}\n${results.url || ''}\n${results.related.map((item) => `${item.text} ${item.url || ''}`).join('\n')}` }];
    }
    const urlMatch = lastUserMessage.match(/https?:\/\/[^\s)]+/i);
    if (profile === 'agent' && urlMatch) {
      events.push({ label: 'Leyendo página web', status: 'completed' });
      const pageText = await readWebpage(urlMatch[0]);
      enrichedMessages = [...enrichedMessages, { role: 'system', content: `Contenido extraído de ${urlMatch[0]}:\n${pageText}` }];
    }
    if (profile === 'agent' && /\b(imagen|ilustración|visual|genera|dibuja|poster)\b/i.test(lastUserMessage)) {
      events.push({ label: 'Generando imagen', status: 'completed' });
      image = `https://image.pollinations.ai/prompt/${encodeURIComponent(lastUserMessage)}?width=1024&height=768&nologo=true&enhance=true`;
    }
    const codeMatch = lastUserMessage.match(/```(python|javascript|js)?\s*([\s\S]*?)```/i);
    if (profile === 'agent' && codeMatch) {
      const language = (codeMatch[1] || (codeMatch[2].includes('console.log') ? 'javascript' : 'python')).toLowerCase() === 'js' ? 'javascript' : ((codeMatch[1] || 'python').toLowerCase() as 'python' | 'javascript');
      const output = await executeCode(language, codeMatch[2]);
      enrichedMessages = [...enrichedMessages, { role: 'system', content: `Resultado de execute_code (${language}):\n${output || '(sin salida)'}` }];
      events.push({ label: `Código ejecutado · ${language}`, status: 'completed' });
    } else if (profile === 'agent' && /\b(calcula|cálculo|resultado|suma|promedio)\b/i.test(lastUserMessage)) {
      const expression = lastUserMessage.match(/[0-9][0-9+\-*/().,%\s]{2,}/)?.[0]?.trim();
      if (expression) { const result = safeMath(expression); enrichedMessages = [...enrichedMessages, { role: 'system', content: `Resultado de herramienta matemática para ${expression}: ${result}` }]; events.push({ label: `Cálculo ejecutado: ${result}`, status: 'completed' }); }
    }
    let answer = await callCompatibleProvider(profile, enrichedMessages, context, body.providerKey, body.providerBaseUrl, body.requestedModel);
    if (!answer) answer = await callPollinations(profile, enrichedMessages, context, body.thoughtLevel || 'medium').catch(() => null);
    if (!answer) answer = localReply(profile, lastUserMessage, context);
    if (/\b(canvas|lienzo|documento|escribe|actualiza el archivo)\b/i.test(lastUserMessage)) {
      const content = `# ${lastUserMessage.slice(0, 72)}\n\n${answer}`;
      canvas = { name: 'proyecto-agente.md', content };
      const documentId = makeId();
      await db('INSERT INTO cf_canvas (id, session_id, name, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP', [documentId, request.sessionId, canvas.name, canvas.content]);
      memory.canvas.set(`${request.sessionId}:${canvas.name}`, { id: documentId, sessionId: request.sessionId!, ...canvas, updatedAt: now().toISOString() });
      events.push({ label: 'Canvas actualizado', status: 'completed' });
    }
    let file: { name: string; url: string } | undefined;
    if (profile === 'agent' && /\b(crea|genera|guarda|descargable|archivo|script|html)\b/i.test(lastUserMessage)) {
      file = await createFile(lastUserMessage.match(/(?:archivo|file)\s+([\w.-]+)/i)?.[1] || 'resultado.txt', answer);
      events.push({ label: `Archivo creado · ${file.name}`, status: 'completed' });
    }
    const conversationId = await getConversation(request.sessionId!, body.conversationId);
    await persistMessage(request.sessionId!, conversationId, { role: 'user', content: lastUserMessage }, profile);
    await persistMessage(request.sessionId!, conversationId, { role: 'assistant', content: answer }, profile);
    for (const item of context) await db('INSERT INTO cf_context_files (id, session_id, name, size_label, mime_type, content) VALUES (?, ?, ?, ?, ?, ?)', [makeId(), request.sessionId, item.name, item.size || '', item.type || '', item.content]);
    response.json({ answer: file ? `${answer}\n\nArchivo descargable: ${file.url}` : answer, profile, events, image, canvas, file, conversationId, provider: body.providerKey || body.providerBaseUrl || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY ? 'compatible' : 'pollinations-public' });
  } catch (error) {
    response.status(200).json({ answer: `${localReply(profile, lastUserMessage, context)}\n\nNota del router: ${(error as Error).message}`, profile, events, provider: 'fallback-local' });
  }
});

app.post('/api/canvas', async (request: RequestWithSession, response: Response) => {
  const { name = 'proyecto-agente.md', content = '' } = request.body as { name?: string; content?: string };
  const id = makeId();
  await db('INSERT INTO cf_canvas (id, session_id, name, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP', [id, request.sessionId, name, content]);
  memory.canvas.set(`${request.sessionId}:${name}`, { id, sessionId: request.sessionId!, name, content, updatedAt: now().toISOString() });
  response.json({ ok: true, name, content, persistent: Boolean(pool) });
});

app.post('/api/search', async (request: Request, response: Response) => {
  const query = String((request.body as { query?: string }).query || '').trim();
  if (!query) return response.status(400).json({ error: 'Falta query.' });
  try { return response.json(await searchWeb(query)); } catch (error) { return response.status(502).json({ error: (error as Error).message }); }
});

app.post('/api/tools/code', (request: Request, response: Response) => {
  try { return response.json({ result: safeMath(String((request.body as { expression?: string }).expression || '')) }); } catch (error) { return response.status(400).json({ error: (error as Error).message }); }
});

const clientDist = path.join(rootDir, 'dist');
app.use('/generated', express.static(generatedDir));
if (fs.existsSync(clientDist)) { app.use(express.static(clientDist)); app.get('*', (_request, response) => response.sendFile(path.join(clientDist, 'index.html'))); }

await initDatabase();
app.listen(port, '0.0.0.0', () => console.log(`CleusForge API listening on 0.0.0.0:${port}`));
