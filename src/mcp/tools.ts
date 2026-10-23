/**
 * What the MCP server can do. Each tool is a thin wrapper over code the editor
 * already runs: the guide is the Build prompt, building goes through the same
 * importer and normaliser as a pasted answer, and the link is a normal share
 * link. Nothing is stored; the diagram travels in the link.
 */

import type { AccountNode, StructureDocument } from '../domain/document';
import { specOf } from '../domain/kinds';
import { importFromText } from '../share/import';
import { diagramGuide } from '../share/prompt';
import { buildShareUrl } from '../share/url';

export interface ToolContext {
  /** Where the editor is served, so links open this deployment. */
  readonly appUrl: URL;
}

export interface ToolResult {
  readonly text: string;
  readonly structured?: Record<string, unknown>;
  readonly isError?: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, boolean>;
  readonly run: (args: Record<string, unknown>, context: ToolContext) => ToolResult;
}

const GUIDE_INTRO = `Build the diagram as one JSON object in the shape below, then pass it to the
build_diagram tool as "diagram". The tool answers with a link that opens the
diagram in the editor, where it can be refined by hand.
`;

export function mcpGuide(): string {
  return `${GUIDE_INTRO}\n${diagramGuide()}`;
}

/** Counts what a document carries, to tell the caller what validation removed. */
interface Census {
  nodes: number;
  links: number;
  terminals: number;
  integrations: number;
  methods: number;
  settings: number;
}

function emptyCensus(): Census {
  return { nodes: 0, links: 0, terminals: 0, integrations: 0, methods: 0, settings: 0 };
}

function lengthOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object' && value !== null) return Object.keys(value).length;
  return 0;
}

/** The same census over whatever the caller sent, before validation. */
function censusOfRaw(value: unknown): Census {
  const census = emptyCensus();
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    census.nodes += 1;
    census.links += lengthOf(record['links']);
    census.terminals += lengthOf(record['terminals']);
    census.integrations += lengthOf(record['integrations']);
    census.methods += lengthOf(record['methods']);
    census.settings += lengthOf(record['settings']);
    const children = record['children'];
    if (Array.isArray(children)) children.forEach(visit);
  };
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  visit(record && 'root' in record ? record['root'] : value);
  return census;
}

function censusOf(doc: StructureDocument): Census {
  const census = emptyCensus();
  const visit = (node: AccountNode): void => {
    census.nodes += 1;
    census.links += node.links.length;
    census.terminals += node.terminals.length;
    census.integrations += node.integrations.length;
    census.methods += node.methods.length;
    census.settings += node.settings.length;
    node.children.forEach(visit);
  };
  visit(doc.root);
  return census;
}

const CENSUS_LABELS: Record<keyof Census, [string, string]> = {
  nodes: ['node', 'nodes'],
  links: ['link', 'links'],
  terminals: ['terminal', 'terminals'],
  integrations: ['integration', 'integrations'],
  methods: ['payment method', 'payment methods'],
  settings: ['setting', 'settings'],
};

/**
 * What validation dropped, in words. It cannot say which entry and why, only
 * how many, but that is enough for a model to re-read the guide and retry.
 */
function droppedSummary(before: Census, after: Census): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(CENSUS_LABELS) as (keyof Census)[]) {
    const lost = before[key] - after[key];
    if (lost <= 0) continue;
    const [one, many] = CENSUS_LABELS[key];
    lines.push(`${lost} ${lost === 1 ? one : many}`);
  }
  return lines;
}

/** An indented outline, so the caller can check the result without opening it. */
export function outline(doc: StructureDocument): string {
  const names = new Map<string, string>();
  const collect = (node: AccountNode): void => {
    names.set(node.id, node.name);
    node.children.forEach(collect);
  };
  collect(doc.root);

  const lines: string[] = [];
  const visit = (node: AccountNode, depth: number): void => {
    const details: string[] = [];
    if (node.terminals.length > 0) details.push(`terminals: ${node.terminals.join(', ')}`);
    if (node.integrations.length > 0) {
      details.push(
        `integrations: ${node.integrations.map((entry) => (entry.version ? `${entry.id} ${entry.version}` : entry.id)).join(', ')}`,
      );
    }
    if (node.methods.length > 0) details.push(`methods: ${node.methods.join(', ')}`);
    if (node.settings.length > 0) {
      details.push(`settings: ${node.settings.map((setting) => `${setting.key}=${setting.value}`).join(', ')}`);
    }
    if (node.links.length > 0) {
      details.push(`linked to: ${node.links.map((id) => names.get(id) ?? id).join(', ')}`);
    }
    const suffix = details.length > 0 ? ` [${details.join('; ')}]` : '';
    lines.push(`${'  '.repeat(depth)}- ${node.name} (${specOf(node.kind).caption})${suffix}`);
    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(doc.root, 0);
  return lines.join('\n');
}

/**
 * The document in the shape the guide describes: settings as an object, and
 * empty fields left out, so a model can edit it and send it straight back.
 */
export function toAuthoringJson(doc: StructureDocument): unknown {
  const convert = (node: AccountNode): Record<string, unknown> => {
    const out: Record<string, unknown> = { id: node.id, kind: node.kind, name: node.name };
    if (node.note !== '') out['note'] = node.note;
    if (node.settings.length > 0) {
      out['settings'] = Object.fromEntries(node.settings.map((setting) => [setting.key, setting.value]));
    }
    if (node.terminals.length > 0) out['terminals'] = [...node.terminals];
    if (node.integrations.length > 0) {
      out['integrations'] = node.integrations.map((entry) =>
        entry.version === '' ? { id: entry.id } : { id: entry.id, version: entry.version },
      );
    }
    if (node.methods.length > 0) out['methods'] = [...node.methods];
    if (node.logoDomain !== '') out['logoDomain'] = node.logoDomain;
    if (node.links.length > 0) out['links'] = [...node.links];
    if (node.children.length > 0) out['children'] = node.children.map(convert);
    return out;
  };
  return { root: convert(doc.root) };
}

function error(text: string): ToolResult {
  return { text, isError: true };
}

const getGuide: ToolDefinition = {
  name: 'get_diagram_guide',
  title: 'How to write an account-structure diagram',
  description:
    'Returns the rules for describing an Adyen account structure as JSON: the node kinds, what may nest in what, ' +
    'links, settings, terminals, integration and payment-method ids, and two worked examples. ' +
    'Call this once before build_diagram.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: () => ({ text: mcpGuide() }),
};

const buildDiagram: ToolDefinition = {
  name: 'build_diagram',
  title: 'Build an account-structure diagram',
  description:
    'Validates a diagram written as described by get_diagram_guide and returns a link that opens it in the ' +
    'Adyen account-structure editor, plus an outline of what was drawn and what validation removed. ' +
    'Nothing is stored: the whole diagram is inside the link. Give the user the link.',
  inputSchema: {
    type: 'object',
    properties: {
      diagram: {
        type: 'object',
        description: 'The document, { "root": <company node> }, in the shape get_diagram_guide describes.',
      },
    },
    required: ['diagram'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: (args, context) => {
    const raw = args['diagram'];
    if (raw === undefined || raw === null) return error('Pass the diagram as "diagram".');

    // Models sometimes send the JSON as a string; the importer copes with that,
    // and with a code fence around it.
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const parsed: unknown = typeof raw === 'string' ? safeParse(raw) : raw;
    const outcome = importFromText(text);
    if ('error' in outcome) return error(`${outcome.error} Call get_diagram_guide for the expected shape.`);

    const url = buildShareUrl(outcome.doc, context.appUrl);
    const dropped = parsed === undefined ? [] : droppedSummary(censusOfRaw(parsed), censusOf(outcome.doc));
    const parts = [
      `Open the diagram: ${url}`,
      '',
      `${outcome.nodeCount} ${outcome.nodeCount === 1 ? 'node' : 'nodes'}:`,
      outline(outcome.doc),
    ];
    if (dropped.length > 0) {
      parts.push(
        '',
        `Validation removed ${dropped.join(', ')}: an unknown kind or id, a kind that cannot sit under its ` +
          'parent, a field the kind does not accept, a link between kinds that cannot link, or a limit. ' +
          'Check the outline against get_diagram_guide if that was not intended.',
      );
    }
    return {
      text: parts.join('\n'),
      structured: { url, nodeCount: outcome.nodeCount, removed: dropped },
    };
  },
};

const readDiagram: ToolDefinition = {
  name: 'read_diagram',
  title: 'Read a diagram from its link',
  description:
    'Turns a link from the Adyen account-structure editor back into JSON, so an existing diagram can be ' +
    'changed: edit the JSON and pass it to build_diagram for a new link.',
  inputSchema: {
    type: 'object',
    properties: {
      link: { type: 'string', description: 'A share link from the editor, or the part after "#d=".' },
    },
    required: ['link'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: (args) => {
    const link = args['link'];
    if (typeof link !== 'string' || link.trim() === '') return error('Pass the share link as "link".');
    const outcome = importFromText(link);
    if ('error' in outcome || outcome.source !== 'link') {
      return error('That is not a link from the account-structure editor.');
    }
    const json = toAuthoringJson(outcome.doc);
    return {
      text: `${outline(outcome.doc)}\n\n${JSON.stringify(json, null, 2)}`,
      structured: { diagram: json },
    };
  },
};

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export const TOOLS: readonly ToolDefinition[] = [getGuide, buildDiagram, readDiagram];
