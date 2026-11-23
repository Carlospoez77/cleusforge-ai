import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Command,
  Copy,
  FileCode2,
  FileText,
  FolderOpen,
  Globe2,
  ImagePlus,
  Layers3,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PanelRight,
  PanelRightClose,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  SquareTerminal,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { runPythonInBrowser } from './pyodideRunner';

type ModelId = 'fast' | 'smartest' | 'coding' | 'agent';
type Role = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  tool?: string;
};

type ContextFile = {
  id: string;
  name: string;
  size: string;
  type: string;
  content: string;
};

type ModelProfile = {
  id: ModelId;
  name: string;
  short: string;
  description: string;
  icon: typeof Zap;
  accent: string;
};

const modelProfiles: ModelProfile[] = [
  {
    id: 'fast',
    name: 'Modo Rápido',
    short: 'FAST',
    description: 'Respuestas ágiles para explorar ideas.',
    icon: Zap,
    accent: 'gold',
  },
  {
    id: 'smartest',
    name: 'Razonamiento Profundo',
    short: 'SMART',
    description: 'Más contexto para decisiones complejas.',
    icon: Sparkles,
    accent: 'violet',
  },
  {
    id: 'coding',
    name: 'Codificación',
    short: 'CODE',
    description: 'Construye, depura y explica software.',
    icon: Code2,
    accent: 'blue',
  },
  {
    id: 'agent',
    name: 'Agente Autónomo',
    short: 'AGENT',
    description: 'Planifica y usa herramientas conectadas.',
    icon: SquareTerminal,
    accent: 'green',
  },
];

const starterMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    timestamp: '14:22',
    content:
      'Hola, soy CleusForge. Puedo ayudarte a investigar, escribir, programar o convertir un borrador en un proyecto. Añade contexto cuando quieras y abre el Lienzo para trabajar en paralelo.',
  },
];

const historyItems = [
  { title: 'Diseño del agente autónomo', time: 'hace 4 min', active: true, tone: 'amber' },
  { title: 'Arquitectura de CleusForge', time: 'ayer', active: false, tone: 'blue' },
  { title: 'Comparativa de modelos', time: 'ayer', active: false, tone: 'violet' },
  { title: 'Ideas para el onboarding', time: '12 nov', active: false, tone: 'green' },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const timeNow = () =>
  new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

function App() {
  const [activeModel, setActiveModel] = useState<ModelId>('agent');
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [history, setHistory] = useState(historyItems);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [canvasText, setCanvasText] = useState('# Lienzo\n\nEmpieza a escribir aquí…');
  const [canvasSaved, setCanvasSaved] = useState(true);
  const [thoughtLevel, setThoughtLevel] = useState('medium');
  const [apiKey, setApiKey] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [toolEvents, setToolEvents] = useState<Array<{ label: string; status: string }>>([]);
  const [generatedImage, setGeneratedImage] = useState('');
  const [sessionPersistent, setSessionPersistent] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedModel = modelProfiles.find((profile) => profile.id === activeModel) ?? modelProfiles[0];
  const SelectedIcon = selectedModel.icon;

  const contextSummary = useMemo(() => {
    if (!contextFiles.length) return 'Sin archivos';
    return `${contextFiles.length} archivo${contextFiles.length > 1 ? 's' : ''} en contexto`;
  }, [contextFiles.length]);

  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    return () => window.removeEventListener('beforeinstallprompt', captureInstall);
  }, []);

  useEffect(() => {
    setApiKey(localStorage.getItem('cleusforge_api_key') || '');
    setThoughtLevel(localStorage.getItem('cleusforge_thought_level') || 'medium');
    void fetch('/api/session').then((response) => response.json()).then((data) => {
      setSessionPersistent(Boolean(data.persistent));
      const latestCanvas = data.canvas?.[0];
      if (latestCanvas?.content) setCanvasText(latestCanvas.content);
      const latestConversation = data.conversations?.[0];
      if (data.conversations?.length) setHistory(data.conversations.map((item: { id: string; title: string; updatedAt?: string }, index: number) => ({ title: item.title, time: index === 0 ? 'ahora' : 'guardado', active: index === 0, tone: index % 2 ? 'blue' : 'amber' })));
      if (latestConversation?.id) void fetch(`/api/conversations/${latestConversation.id}/messages`).then((response) => response.json()).then((messageData) => {
        if (messageData.messages?.length) setMessages(messageData.messages.map((item: { role: Role; content: string; createdAt?: string; model?: string }, index: number) => ({ id: `persisted-${index}`, role: item.role, content: item.content, timestamp: item.createdAt ? new Date(item.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : timeNow(), tool: item.model ? `persistido · ${item.model}` : undefined })));
      }).catch(() => undefined);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = await Promise.all(
      Array.from(fileList).slice(0, 6).map(async (file) => ({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        size: formatBytes(file.size),
        type: file.type || 'text/plain',
        content: (await file.text()).slice(0, 120_000),
      })),
    );
    setContextFiles((current) => [...current, ...nextFiles]);
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: timeNow(),
    };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInput('');
    setIsSending(true);
    setActivity(activeModel === 'agent' ? 'Analizando la solicitud…' : `Consultando ${selectedModel.name}…`);
    setToolEvents([]);
    setGeneratedImage('');

    try {
      const activityTimer = window.setTimeout(() => setActivity(activeModel === 'agent' ? 'Ejecutando herramientas…' : 'Redactando respuesta…'), 700);
      let pythonContext: ContextFile | null = null;
      if (activeModel === 'agent' && /\b(py(thon)?|código python|ejecuta este código)\b/i.test(trimmed) && /```/.test(trimmed)) {
        setActivity('Ejecutando Python en sandbox del navegador…');
        const code = trimmed.match(/```(?:python)?\s*([\s\S]*?)```/i)?.[1] || '';
        const result = await runPythonInBrowser(code);
        pythonContext = { id: `python-${Date.now()}`, name: 'sandbox-output.txt', size: `${result.length} caracteres`, type: 'text/plain', content: result };
      }
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          messages: conversation.map(({ role, content }) => ({ role, content })),
          context: [...contextFiles, ...(pythonContext ? [pythonContext] : [])].map(({ name, content, size, type }) => ({ name, content, size, type })),
          providerKey: apiKey || undefined,
          thoughtLevel,
        }),
      });
      window.clearTimeout(activityTimer);
      if (!response.ok) throw new Error('No se pudo iniciar el streaming de la respuesta.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('El navegador no soporta streaming en esta sesión.');
      const assistantId = `assistant-${Date.now()}`;
      let streamedAnswer = '';
      let payload: { answer?: string; events?: Array<{ label: string; status: string }>; image?: string; canvas?: { content?: string }; provider?: string } = {};
      setMessages((current) => [...current, { id: assistantId, role: 'assistant', content: '', timestamp: timeNow() }]);
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const block of events) {
          const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const eventData = JSON.parse(dataLine.slice(6)) as { delta?: string; error?: string; answer?: string; events?: Array<{ label: string; status: string }>; image?: string; canvas?: { content?: string }; provider?: string };
          if (eventData.error) throw new Error(eventData.error);
          if (eventData.delta) {
            streamedAnswer += eventData.delta;
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: streamedAnswer } : message));
          }
          if (eventData.answer !== undefined) payload = eventData;
        }
      }
      if (!payload.answer) payload.answer = streamedAnswer;
      setToolEvents(payload.events || []);
      if (payload.image) setGeneratedImage(payload.image);
      if (payload.canvas?.content) {
        setCanvasText(payload.canvas.content);
        setCanvasSaved(true);
        setIsCanvasOpen(true);
      }
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: payload.answer || streamedAnswer, tool: payload.events?.length ? payload.events.map((event) => event.label).join(' · ') : payload.provider } : message));
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `No pude conectar con el router ahora. ${error instanceof Error ? error.message : 'Revisa el backend.'}`,
          timestamp: timeNow(),
        },
      ]);
    } finally {
      setIsSending(false);
      setActivity('');
      textareaRef.current?.focus();
    }
  };

  const handleCopy = async (message: ChatMessage) => {
    await navigator.clipboard?.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(null), 1400);
  };

  const quickPrompts = [
    { label: 'Investigar', icon: Globe2, prompt: 'Investiga y sintetiza un tema actual con fuentes.' },
    { label: 'Construir', icon: Code2, prompt: 'Ayúdame a convertir esta idea en un plan técnico ejecutable.' },
    { label: 'Analizar', icon: BarChart3, prompt: 'Analiza los datos disponibles y señala los hallazgos principales.' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button className="mobile-menu icon-button" onClick={() => setIsSidebarOpen((open) => !open)} aria-label="Mostrar navegación">
            <Menu size={18} />
          </button>
          <div className="brand-mark"><span>CF</span></div>
          <div>
            <div className="brand-name">CleusForge <span>AI</span></div>
            <div className="brand-subtitle">workspace / sesión personal</div>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="connection-state"><span className="status-dot" /> <span>Router conectado</span></div>
          {installPrompt && <button className="install-button" onClick={handleInstall}><Upload size={14} /> Instalar</button>}
          <button className="icon-button" aria-label="Configuración" onClick={() => setIsSettingsOpen(true)}><Settings2 size={18} /></button>
          <div className="avatar">CF</div>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <div className="sidebar-top">
            <button className="new-chat-button" onClick={() => setMessages(starterMessages)}><MessageSquarePlus size={17} /> <span>Nuevo chat</span><kbd>⌘ K</kbd></button>
            <div className="sidebar-section-label"><span>Workspace</span><MoreHorizontal size={16} /></div>
            <nav className="workspace-nav">
              <button className="nav-item active"><Layers3 size={16} /><span>Conversaciones</span><span className="nav-count">4</span></button>
              <button className="nav-item"><FolderOpen size={16} /><span>Archivos</span></button>
              <button className="nav-item"><SquareTerminal size={16} /><span>Agentes</span><span className="beta-badge">BETA</span></button>
            </nav>
          </div>
          <div className="history-section">
            <div className="sidebar-section-label"><span>Reciente</span><button className="quiet-button" aria-label="Buscar en historial"><Search size={15} /></button></div>
            <div className="history-list">
              {history.map((item) => (
                <button key={item.title} className={`history-item ${item.active ? 'selected' : ''}`}>
                  <span className={`history-dot ${item.tone}`} />
                  <span className="history-copy"><strong>{item.title}</strong><small>{item.time}</small></span>
                  {item.active && <span className="selected-line" />}
                </button>
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="memory-card"><div className="memory-top"><span><Sparkles size={13} /> Memoria de sesión</span><span className="memory-live">LIVE</span></div><p>El contexto de este chat permanece disponible mientras trabajas.</p><div className="memory-meter"><span /></div></div>
            <button className="nav-item muted"><Trash2 size={15} /><span>Limpiar sesión</span></button>
          </div>
        </aside>

        <main className="chat-column">
          <div className="chat-header">
            <div className="chat-title-wrap"><div className="eyebrow"><span className="eyebrow-line" /> PROYECTO ACTIVO</div><h1>Diseño del agente autónomo</h1><div className="chat-meta"><button className="meta-pill model-trigger" onClick={() => setIsModelOpen((open) => !open)}><SelectedIcon size={12} /> {selectedModel.name} <ChevronDown size={12} /></button><span>·</span><span>{contextSummary}</span><span>·</span><span>{sessionPersistent ? 'Memoria persistente' : 'Memoria local'}</span><div className="model-menu">{isModelOpen && modelProfiles.map((profile) => { const Icon = profile.icon; return <button key={profile.id} className={profile.id === activeModel ? 'selected' : ''} onClick={() => { setActiveModel(profile.id); setIsModelOpen(false); }}><Icon size={14} /><span><strong>{profile.name}</strong><small>{profile.description}</small></span><span className="model-short">{profile.short}</span></button>; })}</div></div></div>
            <div className="chat-header-actions"><button className={`canvas-toggle ${isCanvasOpen ? 'selected' : ''}`} onClick={() => setIsCanvasOpen((open) => !open)}>{isCanvasOpen ? <PanelRightClose size={16} /> : <PanelRight size={16} />} <span>Lienzo</span></button><button className="icon-button subtle"><MoreHorizontal size={18} /></button></div>
          </div>

          <div className="messages-scroll">
            <div className="message-list">
              <div className="date-divider"><span>HOY · 22 NOV 2026</span></div>
              {messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role}`}>
                  <div className={`message-avatar ${message.role}`}>{message.role === 'assistant' ? <span>✦</span> : 'TÚ'}</div>
                  <div className="message-body">
                    <div className="message-heading"><strong>{message.role === 'assistant' ? 'CleusForge' : 'Tú'}</strong><span>{message.timestamp}</span>{message.tool && <span className="tool-label"><SquareTerminal size={11} /> {message.tool}</span>}</div>
                    <div className="message-content">{message.content.split('\n').map((line, index) => <p key={`${message.id}-${index}`}>{line || '\u00a0'}</p>)}</div>
                    {message.role === 'assistant' && <div className="message-actions"><button onClick={() => handleCopy(message)}>{copiedId === message.id ? <Check size={13} /> : <Copy size={13} />} {copiedId === message.id ? 'Copiado' : 'Copiar'}</button><button onClick={() => { setCanvasText((current) => `${current}\n\n${message.content}`); setCanvasSaved(false); setIsCanvasOpen(true); }}><Plus size={13} /> Guardar en canvas</button></div>}
                  </div>
                </article>
              ))}
              {isSending && <article className="message-row assistant"><div className="message-avatar assistant"><span>✦</span></div><div className="message-body"><div className="message-heading"><strong>CleusForge</strong><span>ahora</span></div><div className="thinking"><span /><span /><span /> {activity || `pensando con ${selectedModel.short}`}</div></div></article>}
              {!!toolEvents.length && <div className="agent-trace">{toolEvents.map((event) => <span key={event.label}><Check size={11} /> {event.label}</span>)}</div>}
              {!!generatedImage && <div className="generated-image-card"><div className="eyebrow"><span className="eyebrow-line" /> SALIDA MULTIMEDIA</div><img src={generatedImage} alt="Imagen generada por CleusForge" /><a href={generatedImage} target="_blank" rel="noreferrer">Abrir imagen generada <ChevronRight size={13} /></a></div>}
            </div>
          </div>

          <div className="composer-area">
            <div className="quick-actions">{quickPrompts.map(({ label, icon: Icon, prompt }) => <button key={label} onClick={() => setInput(prompt)}><Icon size={14} /> {label}</button>)}</div>
            <form className="composer" onSubmit={handleSubmit}>
              <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder="Escribe una pregunta o describe lo que quieres construir…" rows={2} />
              <div className="composer-toolbar"><div className="composer-tools"><input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.js,.ts,.tsx,.py" onChange={(event) => void addFiles(event.target.files)} /><button type="button" className="tool-button" onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /> Adjuntar</button><button type="button" className="tool-button" onClick={() => setIsCanvasOpen(true)}><FileCode2 size={15} /> Añadir al canvas</button><span className="context-label"><span className="context-indicator" /> {contextSummary}</span></div><button className="send-button" type="submit" disabled={isSending || !input.trim()}><Send size={16} /> Enviar <kbd>↵</kbd></button></div>
            </form>
            <div className="composer-note">CleusForge puede equivocarse. Revisa las respuestas importantes antes de usarlas.</div>
          </div>
        </main>

        {isCanvasOpen && <aside className="canvas-column">
          <div className="canvas-header"><div><div className="eyebrow"><span className="eyebrow-line" /> LIENZO</div><div className="canvas-title"><FileText size={16} /> proyecto-agente.md</div></div><div className="canvas-actions"><span className={`save-state ${canvasSaved ? '' : 'unsaved'}`}>{canvasSaved ? <Check size={12} /> : <span className="unsaved-dot" />} {canvasSaved ? 'Guardado' : 'Sin guardar'}</span><button className="icon-button subtle" onClick={() => setIsCanvasOpen(false)} aria-label="Cerrar lienzo"><X size={17} /></button></div></div>
          <div className="canvas-tabs"><button className="active"><FileText size={13} /> Documento</button><button><Code2 size={13} /> Código</button><button><BarChart3 size={13} /> Datos</button></div>
          <textarea className="canvas-editor" value={canvasText} onChange={(event) => { setCanvasText(event.target.value); setCanvasSaved(false); }} onBlur={() => { setCanvasSaved(true); void fetch('/api/canvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'proyecto-agente.md', content: canvasText }) }); }} spellCheck={false} />
          <div className="canvas-footer"><span><Command size={12} /> Markdown</span><span>1.2 KB</span></div>
        </aside>}
      </div>
      {isSettingsOpen && <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}><section className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="settings-header"><div><div className="eyebrow"><span className="eyebrow-line" /> AJUSTES LOCALES</div><h2>Conexión y razonamiento</h2></div><button className="icon-button subtle" onClick={() => setIsSettingsOpen(false)}><X size={17} /></button></div><p className="settings-copy">Puedes usar el router público sin configuración o añadir tu propia clave. La clave se guarda solo en este navegador y se envía únicamente con tus solicitudes.</p><label className="settings-label">OpenRouter / endpoint compatible<input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); localStorage.setItem('cleusforge_api_key', event.target.value); }} placeholder="sk-or-… (opcional)" /></label><label className="settings-label">Nivel de pensamiento<div className="thought-options">{['off', 'low', 'medium', 'high', 'max'].map((level) => <button key={level} className={thoughtLevel === level ? 'selected' : ''} onClick={() => { setThoughtLevel(level); localStorage.setItem('cleusforge_thought_level', level); }}>{level === 'medium' ? 'Medium' : level[0].toUpperCase() + level.slice(1)}</button>)}</div></label><div className="settings-footer"><span><span className="status-dot" /> {sessionPersistent ? 'Sesión persistente activa' : 'Sesión anónima lista'}</span><button className="send-button" onClick={() => setIsSettingsOpen(false)}><Check size={14} /> Listo</button></div></section></div>}
    </div>
  );
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}

export default App;
