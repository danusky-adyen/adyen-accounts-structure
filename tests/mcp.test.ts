import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSIONS, handleMcpRequest } from '../src/mcp/server';
import { TOOLS, outline } from '../src/mcp/tools';
import { importFromText } from '../src/share/import';
import { buildImportPrompt, diagramGuide } from '../src/share/prompt';
import { readSharedDocument } from '../src/share/url';
import { kinds } from './helpers';

const ENDPOINT = 'https://diagrams.example/api/mcp';

const DIAGRAM = {
  root: {
    id: 'acme',
    kind: 'company',
    name: 'Acme Group',
    settings: { merchantCategoryCode: '5411' },
    children: [
      {
        id: 'web',
        kind: 'ecom',
        name: 'Acme Online',
        integrations: [{ id: 'webDropin', version: 'v6' }],
        methods: ['visa', 'ideal'],
        links: ['bp'],
      },
      {
        kind: 'pos',
        name: 'Acme Stores',
        children: [{ kind: 'store', name: 'Flagship', terminals: ['counter'] }],
      },
      { id: 'bp', kind: 'bp', name: 'Acme Platform' },
    ],
  },
};

let nextId = 1;

async function post(body: unknown, init: RequestInit = {}): Promise<Response> {
  return handleMcpRequest(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
      ...init,
    }),
  );
}

async function rpc(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await post({ jsonrpc: '2.0', id: nextId++, method, ...(params ? { params } : {}) });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/json');
  return (await response.json()) as Record<string, unknown>;
}

interface CallResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const reply = await rpc('tools/call', { name, arguments: args });
  return reply['result'] as CallResult;
}

describe('MCP protocol', () => {
  it('initializes with the version the client asks for, or the newest it knows', async () => {
    const known = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    const result = known['result'] as Record<string, unknown>;
    expect(result['protocolVersion']).toBe('2025-06-18');
    expect(result['capabilities']).toHaveProperty('tools');
    expect(result['serverInfo']).toMatchObject({ name: 'adyen-account-structure' });

    const unknown = await rpc('initialize', { protocolVersion: '1999-01-01' });
    expect((unknown['result'] as Record<string, unknown>)['protocolVersion']).toBe(PROTOCOL_VERSIONS[0]);
  });

  it('accepts notifications without a body', async () => {
    const response = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  it('lists the tools with their schemas', async () => {
    const reply = await rpc('tools/list');
    const tools = (reply['result'] as { tools: { name: string; inputSchema: unknown }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['get_diagram_guide', 'build_diagram', 'read_diagram']);
    for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: 'object' });
    expect(tools[0]).not.toHaveProperty('run');
  });

  it('answers unknown methods and tools with JSON-RPC errors', async () => {
    const method = await rpc('resources/list');
    expect(method['error']).toMatchObject({ code: -32601 });
    const tool = await rpc('tools/call', { name: 'delete_everything', arguments: {} });
    expect(tool['error']).toMatchObject({ code: -32602 });
  });

  it('rejects a body that is not JSON', async () => {
    const response = await post(undefined, { body: '{not json' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32700 } });
  });

  it('offers no event stream, and answers CORS preflights', async () => {
    const get = await handleMcpRequest(new Request(ENDPOINT, { method: 'GET' }));
    expect(get.status).toBe(405);
    const options = await handleMcpRequest(new Request(ENDPOINT, { method: 'OPTIONS' }));
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers each message of a batch', async () => {
    const response = await post([
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'ping' },
    ]);
    const replies = (await response.json()) as { id: string }[];
    expect(replies.map((reply) => reply.id)).toEqual(['a', 'b']);
  });

  it('fills the notes into the prompt', async () => {
    const reply = await rpc('prompts/get', { name: 'diagram_from_notes', arguments: { notes: 'Bakery, 2 shops' } });
    const messages = (reply['result'] as { messages: { content: { text: string } }[] }).messages;
    expect(messages[0]?.content.text).toContain('Bakery, 2 shops');
    expect(messages[0]?.content.text).toContain('## Kinds');
  });
});

describe('MCP tools', () => {
  it('hands out the same guide as the Build prompt', async () => {
    const result = await call('get_diagram_guide', {});
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain(diagramGuide());
    expect(buildImportPrompt()).toContain(diagramGuide());
  });

  it('builds a link on the deployment it was called on', async () => {
    const result = await call('build_diagram', { diagram: DIAGRAM });
    expect(result.isError).toBe(false);
    const url = result.structuredContent?.['url'];
    expect(typeof url).toBe('string');
    expect((url as string).startsWith('https://diagrams.example/#d=')).toBe(true);

    const shared = readSharedDocument(new URL(url as string).hash);
    expect(shared && kinds(shared.doc)).toEqual(['company', 'ecom', 'pos', 'store', 'bp']);
    expect(result.structuredContent?.['nodeCount']).toBe(5);
    expect(result.structuredContent?.['removed']).toEqual([]);
    expect(result.content[0]?.text).toContain('Acme Online');
    expect(result.content[0]?.text).toContain('linked to: Acme Platform');
  });

  it('accepts the diagram as a string, even in a code fence', async () => {
    const result = await call('build_diagram', { diagram: '```json\n' + JSON.stringify(DIAGRAM) + '\n```' });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.['nodeCount']).toBe(5);
  });

  it('says what validation removed', async () => {
    const broken = {
      root: {
        kind: 'company',
        name: 'Acme',
        terminals: ['counter'],
        children: [{ kind: 'spaceship', name: 'Nope' }, { kind: 'ecom', name: 'Web', methods: ['notAMethod'] }],
      },
    };
    const result = await call('build_diagram', { diagram: broken });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.['removed']).toEqual(['1 node', '1 terminal', '1 payment method']);
    expect(result.content[0]?.text).toContain('Validation removed');
  });

  it('reports a missing or unusable diagram as a tool error', async () => {
    expect((await call('build_diagram', {})).isError).toBe(true);
    const garbage = await call('build_diagram', { diagram: 'just some words' });
    expect(garbage.isError).toBe(true);
    expect(garbage.content[0]?.text).toContain('get_diagram_guide');
  });

  it('reads a link back into JSON that builds the same diagram', async () => {
    const built = await call('build_diagram', { diagram: DIAGRAM });
    const url = built.structuredContent?.['url'] as string;

    const read = await call('read_diagram', { link: url });
    expect(read.isError).toBe(false);
    const json = read.structuredContent?.['diagram'];
    expect(json).toMatchObject({ root: { kind: 'company', settings: { merchantCategoryCode: '5411' } } });

    const original = importFromText(url);
    const again = importFromText(JSON.stringify(json));
    if ('error' in original || 'error' in again) throw new Error('import failed');
    // Importing assigns fresh ids, so compare what the diagram shows.
    expect(outline(again.doc)).toBe(outline(original.doc));
  });

  it('refuses something that is not an editor link', async () => {
    expect((await call('read_diagram', { link: JSON.stringify(DIAGRAM) })).isError).toBe(true);
    expect((await call('read_diagram', {})).isError).toBe(true);
  });

  it('describes every tool as read-only', () => {
    for (const tool of TOOLS) expect(tool.annotations['readOnlyHint']).toBe(true);
  });
});
