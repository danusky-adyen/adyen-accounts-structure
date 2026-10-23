/**
 * The MCP endpoint, served at /api/mcp next to the editor.
 *
 * Edge runtime because Vercel bundles edge functions: the Node runtime runs the
 * compiled files as they are, and this project's extensionless ESM imports do
 * not resolve there.
 */

import { handleMcpRequest } from '../src/mcp/server';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
