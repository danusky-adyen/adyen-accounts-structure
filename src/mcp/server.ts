/**
 * A Model Context Protocol server over Streamable HTTP, stateless.
 *
 * Every request carries one JSON-RPC message and gets a plain JSON answer, which
 * the transport allows instead of an event stream. There are no sessions, no
 * server-initiated messages and nothing stored, so it runs as a single function
 * and needs no SDK: the whole protocol surface is initialize, ping, and listing
 * and calling tools and prompts.
 */

import { diagramGuide } from '../share/prompt';
import { TOOLS, type ToolContext } from './tools';

/** Newest first; an unknown version requested by a client gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

const SERVER_INFO = {
  name: 'adyen-account-structure',
  title: 'Adyen account structure',
  version: '1.0.0',
} as const;

const INSTRUCTIONS = `Draws Adyen account-structure diagrams: company, merchant accounts, stores,
terminals, balance platforms and how they link. To draw one from notes, call
get_diagram_guide once, write the JSON it describes using only what the notes
say, call build_diagram, and give the user the link it returns. To change an
existing diagram, call read_diagram with its link, edit the JSON, and build again.`;

const PROMPT = {
  name: 'diagram_from_notes',
  title: 'Diagram from notes',
  description: 'Turn notes, emails or call transcripts about a merchant into an account-structure diagram.',
  arguments: [{ name: 'notes', description: 'What is known about the setup', required: true }],
} as const;

type JsonRpcId = string | number;

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: JsonRpcId | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const CORS_HEADERS = {
  // No cookies and no credentials are involved, so any origin may call it;
  // browser-based clients such as the MCP Inspector need this.
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'mcp-protocol-version',
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...CORS_HEADERS, ...extra } });
}

function rpcError(id: JsonRpcId | null, code: number, message: string): unknown {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record['jsonrpc'] === '2.0' && typeof record['method'] === 'string';
}

function objectParam(params: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
  const value = params?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function negotiateVersion(requested: unknown): string {
  return (PROTOCOL_VERSIONS as readonly unknown[]).includes(requested)
    ? (requested as string)
    : PROTOCOL_VERSIONS[0];
}

/** The result of one request, or a thrown `RpcError`. */
function dispatch(request: JsonRpcRequest, context: ToolContext): unknown {
  const { method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: negotiateVersion(params?.['protocolVersion']),
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };

    case 'ping':
      return {};

    case 'tools/list':
      return {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      };

    case 'tools/call': {
      const name = params?.['name'];
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (!tool) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${String(name)}`);
      // A tool that fails reports it in its result, so the model sees why and can
      // try again; only an unknown tool is a protocol error.
      const result = tool.run(objectParam(params, 'arguments'), context);
      return {
        content: [{ type: 'text', text: result.text }],
        ...(result.structured ? { structuredContent: result.structured } : {}),
        isError: result.isError === true,
      };
    }

    case 'prompts/list':
      return { prompts: [PROMPT] };

    case 'prompts/get': {
      if (params?.['name'] !== PROMPT.name) {
        throw new RpcError(INVALID_PARAMS, `Unknown prompt: ${String(params?.['name'])}`);
      }
      const notes = objectParam(params, 'arguments')['notes'];
      const text =
        `Turn these notes into an Adyen account-structure diagram, then call build_diagram ` +
        `with it and give me the link.\n\n${diagramGuide()}\n## The notes\n\n${typeof notes === 'string' ? notes : ''}\n`;
      return {
        description: PROMPT.description,
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }

    default:
      throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/** One JSON-RPC message in, its response out, or null for a notification. */
function answer(message: unknown, context: ToolContext): unknown {
  if (!isRequest(message)) {
    // Responses from the client (to requests this server never sends) are
    // acknowledged and dropped like notifications.
    const record = typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null;
    if (record && ('result' in record || 'error' in record)) return null;
    return rpcError(null, INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request');
  }
  if (message.id === undefined || message.id === null) return null;

  try {
    return { jsonrpc: '2.0', id: message.id, result: dispatch(message, context) };
  } catch (caught) {
    if (caught instanceof RpcError) return rpcError(message.id, caught.code, caught.message);
    return rpcError(message.id, -32603, 'Internal error');
  }
}

/**
 * Handles one HTTP request to the endpoint. `appUrl` is where the editor lives;
 * by default the origin the request came in on, so a preview deployment hands
 * out links to itself.
 */
export async function handleMcpRequest(request: Request, appUrl?: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return empty(204);
  // No server-to-client stream is offered; the transport answers that with 405.
  if (request.method === 'GET' || request.method === 'DELETE') return empty(405, { allow: 'POST, OPTIONS' });
  if (request.method !== 'POST') return empty(405, { allow: 'POST, OPTIONS' });

  const context: ToolContext = { appUrl: appUrl ?? new URL('/', request.url) };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, PARSE_ERROR, 'The body is not valid JSON'), 400);
  }

  // Batches were dropped from the protocol in 2025-06-18 but older clients may
  // still send one; answering each message costs nothing.
  if (Array.isArray(body)) {
    const responses = body.map((message) => answer(message, context)).filter((response) => response !== null);
    return responses.length === 0 ? empty(202) : json(responses);
  }

  const response = answer(body, context);
  return response === null ? empty(202) : json(response);
}
