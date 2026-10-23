import { Buffer } from 'node:buffer';
import type { IncomingMessage } from 'node:http';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocal(hostOrOrigin: string): boolean {
  try {
    const url = new URL(hostOrOrigin.includes('://') ? hostOrOrigin : `http://${hostOrOrigin}`);
    return LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * The MCP server, on the dev server only: it is a personal experiment, not an
 * approved Adyen MCP, so it is never deployed. The Host and Origin checks keep
 * other machines and web pages (DNS rebinding) away from it.
 */
function mcpDevServer(): Plugin {
  return {
    name: 'mcp-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mcp', (req, res, next) => {
        const host = req.headers.host ?? '';
        const origin = req.headers.origin;
        if (!isLocal(host) || (origin !== undefined && !isLocal(origin))) {
          res.statusCode = 403;
          res.end();
          return;
        }
        void (async () => {
          const { handleMcpRequest } = (await server.ssrLoadModule('/src/mcp/server.ts')) as {
            handleMcpRequest: (request: Request) => Promise<Response>;
          };
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
          }
          const response = await handleMcpRequest(
            new Request(new URL('/api/mcp', `http://${host}`), {
              method: req.method ?? 'GET',
              headers,
              ...(req.method === 'POST' ? { body: await readBody(req) } : {}),
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(next);
      });
    },
  };
}

export default defineConfig({
  // The compiler memoises components and callbacks, so a pan frame only
  // re-renders what actually reads the viewport.
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } }), mcpDevServer()],
  build: {
    target: 'es2022',
    // No source maps in the deployed build: the repository is private, and a
    // map would publish the full commented source to anyone loading the page.
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
