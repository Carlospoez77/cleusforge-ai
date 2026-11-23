type PyodideInstance = { runPythonAsync: (code: string) => Promise<unknown> };
type PyodideLoader = (options: { indexURL: string }) => Promise<PyodideInstance>;

declare global {
  interface Window { loadPyodide?: PyodideLoader; }
}

let pyodidePromise: Promise<PyodideInstance> | null = null;

function loadPyodideInBrowser() {
  if (window.loadPyodide) return window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' });
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
  script.async = true;
  const loaded = new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error('No se pudo cargar Pyodide.')); });
  document.head.appendChild(script);
  return loaded.then(() => window.loadPyodide!({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' }));
}

export async function runPythonInBrowser(code: string) {
  if (code.length > 8000) throw new Error('El sandbox limita el código a 8 KB.');
  pyodidePromise ||= loadPyodideInBrowser();
  const pyodide = await pyodidePromise;
  const result = await pyodide.runPythonAsync(code);
  return String(result ?? 'Ejecutado sin salida.');
}
