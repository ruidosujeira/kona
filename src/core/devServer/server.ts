/**
 * Kona Dev Server
 * 
 * Development server with:
 * - HTTP server for serving bundles
 * - WebSocket for HMR
 * - File watcher for rebuilds
 * - Source map support
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { watch, FSWatcher } from 'chokidar';
import { Bundler, BundleOutput, BundlerOptions } from '../bundler/bundler';

// Server options
export interface DevServerOptions {
  port?: number;
  host?: string;
  open?: boolean;
  https?: boolean;
  proxy?: Record<string, string | ProxyOptions>;
  headers?: Record<string, string>;
  historyApiFallback?: boolean;
  static?: string | string[];
  hmr?: boolean | HMROptions;
  watch?: WatchOptions;
  onReady?: (url: string) => void;
  onError?: (error: Error) => void;
  onRebuild?: (result: BundleOutput) => void;
}

export interface ProxyOptions {
  target: string;
  changeOrigin?: boolean;
  pathRewrite?: Record<string, string>;
}

export interface HMROptions {
  overlay?: boolean;
  reload?: boolean;
  timeout?: number;
}

export interface WatchOptions {
  include?: string[];
  exclude?: string[];
  debounce?: number;
}

// HMR message types
interface HMRMessage {
  type: 'connected' | 'update' | 'full-reload' | 'error' | 'prune';
  timestamp?: number;
  updates?: HMRUpdate[];
  error?: HMRError;
  path?: string;
}

interface HMRUpdate {
  type: 'js' | 'css';
  path: string;
  acceptedPath: string;
  timestamp: number;
}

interface HMRError {
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
}

/**
 * Development server class
 */
export class DevServer {
  private options: Required<DevServerOptions>;
  private bundlerOptions: BundlerOptions;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private watcher: FSWatcher | null = null;
  private bundler: Bundler | null = null;
  private currentBundle: BundleOutput | null = null;
  private clients: Set<WebSocket> = new Set();
  private rebuildTimeout: NodeJS.Timeout | null = null;
  private isRebuilding = false;

  constructor(bundlerOptions: BundlerOptions, serverOptions: DevServerOptions = {}) {
    this.bundlerOptions = bundlerOptions;
    this.options = {
      port: serverOptions.port ?? 4444,
      host: serverOptions.host ?? 'localhost',
      open: serverOptions.open ?? false,
      https: serverOptions.https ?? false,
      proxy: serverOptions.proxy ?? {},
      headers: serverOptions.headers ?? {},
      historyApiFallback: serverOptions.historyApiFallback ?? true,
      static: serverOptions.static ?? 'public',
      hmr: serverOptions.hmr ?? true,
      watch: serverOptions.watch ?? {},
      onReady: serverOptions.onReady ?? (() => {}),
      onError: serverOptions.onError ?? console.error,
      onRebuild: serverOptions.onRebuild ?? (() => {}),
    };
  }

  /**
   * Start the dev server
   */
  async start(): Promise<void> {
    const startTime = Date.now();

    // Initial build
    this.bundler = new Bundler(this.bundlerOptions);
    this.currentBundle = await this.bundler.build();

    // Create HTTP server
    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    // Create WebSocket server for HMR
    if (this.options.hmr) {
      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on('connection', (ws) => this.handleWebSocketConnection(ws));
    }

    // Start file watcher
    this.startWatcher();

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.options.port, this.options.host, () => {
        resolve();
      });
      this.server!.on('error', reject);
    });

    const url = `http://${this.options.host}:${this.options.port}`;
    const buildTime = Date.now() - startTime;

    console.log('');
    console.log(`  ⚡ ${this.colorize('Kona dev server', 'cyan')} ready in ${this.colorize(buildTime + 'ms', 'green')}`);
    console.log('');
    console.log(`  ${this.colorize('➜', 'green')}  Local:   ${this.colorize(url, 'cyan')}`);
    console.log(`  ${this.colorize('➜', 'dim')}  Network: ${this.colorize(`http://0.0.0.0:${this.options.port}`, 'dim')}`);
    console.log('');

    this.options.onReady(url);

    // Open browser
    if (this.options.open) {
      this.openBrowser(url);
    }
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Close WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // Add custom headers
    for (const [key, value] of Object.entries(this.options.headers)) {
      res.setHeader(key, value);
    }

    // CORS headers for dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // HMR client script
    if (pathname === '/@kona/client') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(this.getHMRClientScript());
      return;
    }

    // Source maps
    if (pathname.endsWith('.map')) {
      const chunk = this.findChunkByPath(pathname.replace('.map', ''));
      if (chunk?.map) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(chunk.map);
        return;
      }
    }

    // Bundle files
    const chunk = this.findChunkByPath(pathname);
    if (chunk) {
      res.writeHead(200, { 
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      });
      res.end(chunk.code);
      return;
    }

    // Static files
    const staticDirs = Array.isArray(this.options.static) 
      ? this.options.static 
      : [this.options.static];

    for (const staticDir of staticDirs) {
      const staticPath = path.join(process.cwd(), staticDir, pathname);
      if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        this.serveFile(staticPath, res);
        return;
      }
    }

    // Index.html for SPA
    if (this.options.historyApiFallback) {
      for (const staticDir of staticDirs) {
        const indexPath = path.join(process.cwd(), staticDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          this.serveFile(indexPath, res, true);
          return;
        }
      }

      // Generate default index.html
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getDefaultHTML());
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private findChunkByPath(pathname: string): { code: string; map?: string } | null {
    if (!this.currentBundle) return null;

    // Remove leading slash
    const name = pathname.replace(/^\//, '');

    for (const chunk of this.currentBundle.chunks) {
      // Match by name or hash
      if (name === `${chunk.name}.js` || 
          name === `${chunk.name}.${chunk.hash}.js` ||
          name === chunk.id + '.js') {
        return chunk;
      }
    }

    return null;
  }

  private serveFile(filePath: string, res: http.ServerResponse, injectHMR = false): void {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = this.getContentType(ext);

    let content = fs.readFileSync(filePath);

    // Inject HMR client for HTML files
    if (injectHMR && ext === '.html' && this.options.hmr) {
      let html = content.toString();
      const hmrScript = `<script type="module" src="/@kona/client"></script>`;
      
      // Inject before </head> or at end of <body>
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${hmrScript}\n</head>`);
      } else if (html.includes('</body>')) {
        html = html.replace('</body>', `${hmrScript}\n</body>`);
      } else {
        html += hmrScript;
      }

      // Inject bundle scripts
      if (this.currentBundle) {
        const scripts = this.currentBundle.chunks
          .filter(c => c.isEntry)
          .map(c => `<script type="module" src="/${c.name}.js"></script>`)
          .join('\n');
        
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${scripts}\n</body>`);
        } else {
          html += scripts;
        }
      }

      content = Buffer.from(html);
    }

    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.wasm': 'application/wasm',
    };
    return types[ext] || 'application/octet-stream';
  }

  private getDefaultHTML(): string {
    const scripts = this.currentBundle?.chunks
      .filter(c => c.isEntry)
      .map(c => `<script type="module" src="/${c.name}.js"></script>`)
      .join('\n') || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kona Dev</title>
  <script type="module" src="/@kona/client"></script>
</head>
<body>
  <div id="root"></div>
  ${scripts}
</body>
</html>`;
  }

  /**
   * Handle WebSocket connections for HMR
   */
  private handleWebSocketConnection(ws: WebSocket): void {
    this.clients.add(ws);

    // Send connected message
    this.sendToClient(ws, { type: 'connected', timestamp: Date.now() });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  private sendToClient(ws: WebSocket, message: HMRMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: HMRMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Start file watcher
   */
  private startWatcher(): void {
    const watchPaths = this.options.watch.include || ['src'];
    const ignored = this.options.watch.exclude || ['**/node_modules/**', '**/.git/**', '**/dist/**'];

    console.log(`  ${this.colorize('👀', 'dim')} Watching: ${watchPaths.join(', ')}`);

    this.watcher = watch(watchPaths, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    this.watcher.on('change', (filePath) => {
      console.log(`  ${this.colorize('📝', 'yellow')} Changed: ${filePath}`);
      this.handleFileChange(filePath, 'change');
    });
    this.watcher.on('add', (filePath) => this.handleFileChange(filePath, 'add'));
    this.watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'));
    this.watcher.on('error', (error) => console.error('Watcher error:', error));
  }

  private handleFileChange(filePath: string, event: string): void {
    // Debounce rebuilds
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }

    const debounce = this.options.watch.debounce ?? 100;
    
    this.rebuildTimeout = setTimeout(async () => {
      await this.rebuild(filePath);
    }, debounce);
  }

  private async rebuild(changedFile: string): Promise<void> {
    if (this.isRebuilding) return;
    this.isRebuilding = true;

    const startTime = Date.now();
    console.log(`\n  ${this.colorize('↻', 'yellow')} Rebuilding...`);

    try {
      // Clear resolver cache
      this.bundler = new Bundler(this.bundlerOptions);
      const newBundle = await this.bundler.build();
      
      const buildTime = Date.now() - startTime;
      console.log(`  ${this.colorize('✓', 'green')} Rebuilt in ${this.colorize(buildTime + 'ms', 'green')}`);

      // Determine what changed
      const updates = this.getUpdates(this.currentBundle, newBundle, changedFile);
      
      this.currentBundle = newBundle;
      this.options.onRebuild(newBundle);

      // Send HMR update
      if (updates.length > 0) {
        this.broadcast({
          type: 'update',
          timestamp: Date.now(),
          updates,
        });
      } else {
        // Full reload if we can't determine updates
        this.broadcast({
          type: 'full-reload',
          timestamp: Date.now(),
        });
      }

    } catch (error: any) {
      console.error(`  ${this.colorize('✗', 'red')} Build failed:`, error.message);
      
      this.broadcast({
        type: 'error',
        error: {
          message: error.message,
          stack: error.stack,
        },
      });
    } finally {
      this.isRebuilding = false;
    }
  }

  private getUpdates(
    oldBundle: BundleOutput | null, 
    newBundle: BundleOutput,
    changedFile: string
  ): HMRUpdate[] {
    const updates: HMRUpdate[] = [];
    const ext = path.extname(changedFile).toLowerCase();

    // CSS hot reload
    if (ext === '.css') {
      updates.push({
        type: 'css',
        path: changedFile,
        acceptedPath: changedFile,
        timestamp: Date.now(),
      });
      return updates;
    }

    // JS module update
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
      // Find the chunk containing this module
      for (const chunk of newBundle.chunks) {
        const moduleId = path.relative(process.cwd(), changedFile).replace(/\\/g, '/');
        if (chunk.modules.includes(moduleId)) {
          updates.push({
            type: 'js',
            path: `/${chunk.name}.js`,
            acceptedPath: changedFile,
            timestamp: Date.now(),
          });
        }
      }
    }

    return updates;
  }

  /**
   * Get HMR client script
   */
  private getHMRClientScript(): string {
    return `
// Kona HMR Client
(function() {
  const socket = new WebSocket('ws://' + location.host);
  let isConnected = false;

  socket.onopen = () => {
    isConnected = true;
    console.log('[kona] connected');
  };

  socket.onclose = () => {
    if (isConnected) {
      console.log('[kona] disconnected, attempting reconnect...');
      setTimeout(() => location.reload(), 1000);
    }
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  };

  function handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log('[kona] HMR enabled');
        break;

      case 'update':
        console.log('[kona] update received');
        for (const update of message.updates || []) {
          if (update.type === 'css') {
            updateCSS(update.path);
          } else {
            // For JS, we need to reload the module
            // In a real implementation, this would use import.meta.hot
            location.reload();
          }
        }
        break;

      case 'full-reload':
        console.log('[kona] full reload');
        location.reload();
        break;

      case 'error':
        console.error('[kona] build error:', message.error?.message);
        showErrorOverlay(message.error);
        break;
    }
  }

  function updateCSS(path) {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      if (link.href.includes(path)) {
        const newLink = link.cloneNode();
        newLink.href = path + '?t=' + Date.now();
        link.parentNode.insertBefore(newLink, link.nextSibling);
        link.remove();
        console.log('[kona] CSS updated:', path);
        return;
      }
    }
  }

  function showErrorOverlay(error) {
    // Remove existing overlay
    const existing = document.getElementById('kona-error-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'kona-error-overlay';
    overlay.innerHTML = \`
      <style>
        #kona-error-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          color: #ff5555;
          font-family: monospace;
          padding: 2rem;
          overflow: auto;
          z-index: 99999;
        }
        #kona-error-overlay h1 {
          color: #ff5555;
          margin: 0 0 1rem;
        }
        #kona-error-overlay pre {
          background: #1a1a1a;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
        }
        #kona-error-overlay button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: transparent;
          border: 1px solid #666;
          color: #fff;
          padding: 0.5rem 1rem;
          cursor: pointer;
        }
      </style>
      <button onclick="this.parentElement.remove()">✕ Close</button>
      <h1>Build Error</h1>
      <pre>\${error?.message || 'Unknown error'}</pre>
      \${error?.stack ? '<pre>' + error.stack + '</pre>' : ''}
    \`;
    document.body.appendChild(overlay);
  }

  // Hide error overlay on successful update
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'update') {
      const overlay = document.getElementById('kona-error-overlay');
      if (overlay) overlay.remove();
    }
  });
})();
`;
  }

  private colorize(text: string, color: string): string {
    const colors: Record<string, string> = {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
      red: '\x1b[31m',
    };
    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  private async openBrowser(url: string): Promise<void> {
    const { default: open } = await import('open');
    await open(url);
  }
}

/**
 * Create and start a dev server
 */
export async function createDevServer(
  bundlerOptions: BundlerOptions,
  serverOptions?: DevServerOptions
): Promise<DevServer> {
  const server = new DevServer(bundlerOptions, serverOptions);
  await server.start();
  return server;
}
