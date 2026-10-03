/**
 * Dynamic module loader — loads external JS modules from URLs at runtime.
 *
 * Flow:
 * 1. A <script> tag is injected into the DOM
 * 2. The script calls window.__VTT_SDK__.register(definition)
 * 3. The module appears in the registry and becomes available
 *
 * The SDK must be initialized (initSDK()) before loading external modules.
 */

export interface LoadedScript {
  url: string;
  status: 'loading' | 'loaded' | 'error';
  error?: string;
}

const loadedScripts = new Map<string, LoadedScript>();

/**
 * Load an external module from a URL.
 * Returns a promise that resolves when the script has loaded (or rejects on error).
 */
export function loadExternalModule(url: string): Promise<void> {
  // Already loaded or loading
  const existing = loadedScripts.get(url);
  if (existing?.status === 'loaded') return Promise.resolve();
  if (existing?.status === 'loading') {
    // Wait for the existing load to complete
    return new Promise((resolve, reject) => {
      const script = document.querySelector(`script[data-vtt-module="${CSS.escape(url)}"]`);
      if (!script) return reject(new Error(`Script tag not found for ${url}`));
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error(`Failed to load module from ${url}`)));
    });
  }

  loadedScripts.set(url, { url, status: 'loading' });

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute('data-vtt-module', url);
    // crossorigin for CORS-enabled CDNs
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      loadedScripts.set(url, { url, status: 'loaded' });
      console.log(`[VTT Loader] Module loaded from ${url}`);
      resolve();
    };

    script.onerror = () => {
      const errorMsg = `Failed to load module from ${url}`;
      loadedScripts.set(url, { url, status: 'error', error: errorMsg });
      console.error(`[VTT Loader] ${errorMsg}`);
      reject(new Error(errorMsg));
    };

    document.head.appendChild(script);
  });
}

/**
 * Unload an external module by removing its script tag.
 * Note: this doesn't undo the module's registration — call moduleRegistry.unregister() separately.
 */
export function unloadExternalModule(url: string): void {
  const script = document.querySelector(`script[data-vtt-module="${CSS.escape(url)}"]`);
  if (script) script.remove();
  loadedScripts.delete(url);
}

/**
 * Load multiple external modules in parallel.
 * Returns results for each URL (settled, so one failure doesn't block others).
 */
export async function loadExternalModules(urls: string[]): Promise<Array<{ url: string; ok: boolean; error?: string }>> {
  const results = await Promise.allSettled(urls.map(url => loadExternalModule(url)));
  return results.map((result, i) => ({
    url: urls[i],
    ok: result.status === 'fulfilled',
    error: result.status === 'rejected' ? (result.reason as Error).message : undefined,
  }));
}

/**
 * Get the status of all loaded scripts.
 */
export function getLoadedScripts(): LoadedScript[] {
  return Array.from(loadedScripts.values());
}
