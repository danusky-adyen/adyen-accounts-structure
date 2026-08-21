/**
 * The layout engine: a pure function from document to positioned geometry.
 *
 * The previous version leaned on nested flexbox and then patched up the
 * connectors by reading `offsetLeft` back out of the DOM inside
 * `requestAnimationFrame`, which is what made the lines drift and forced a full
 * recalculation on every keystroke. Positions are now computed up front and the
 * DOM is only ever a projection of the result.
 */

import type { AccountNode, NodeId, StructureDocument } from '../domain/document';
import { collectLinks } from '../domain/document';
import { captionFor, specOf, type NodeKind } from '../domain/kinds';
import {
  assignLanes,
  horizontalBezier,
  rectBottom,
  rectCenterX,
  rectRight,
  roundedPolyline,
  unionRect,
  type Point,
  type Rect,
} from './geometry';
import { integrationLabel } from '../domain/integrations';
import { CARD, LINKS, TREE } from './metrics';
import { wrapText, type TextMeasurer } from './measure';

/** Setting keys defined anywhere in a node's subtree, excluding the node itself. */
function keysSetBelow(node: AccountNode): Set<string> {
  const keys = new Set<string>();
  const visit = (current: AccountNode): void => {
    for (const setting of current.settings) keys.add(setting.key);
    current.children.forEach(visit);
  };
  node.children.forEach(visit);
  return keys;
}

/** An integration chip, positioned relative to the card's top-left corner. */
export interface ChipBox extends Rect {
  readonly label: string;
}

/** A payment-method mark, positioned relative to the card's top-left corner. */
export interface MethodBox extends Rect {
  readonly method: string;
}

/** Where the parts of a card sit, relative to the card's top-left corner. */
export interface CardSlots {
  readonly icon: Rect;
  readonly nameTop: number;
  readonly nameLineHeight: number;
  readonly captionBaselineTop: number;
  readonly terminalsTop: number | null;
  readonly innerWidth: number;
  /**
   * Brand mark, present only when the node has a logo domain. It occupies the
   * icon tile: the caption below already names the account type, so the card
   * can lead with the customer's brand instead of a generic glyph.
   */
  readonly logo: Rect | null;
  readonly chips: readonly ChipBox[];
  readonly methods: readonly MethodBox[];
  /** Methods that did not fit, shown as `+N`. */
  readonly methodOverflow: number;
  /** Position of the `+N` counter, when there is one. */
  readonly methodOverflowBox: Rect | null;
  /** Top of the settings count row, when the node has settings. */
  readonly badgeTop: number | null;
  readonly badgeLabel: string;
}

export interface LayoutNode extends Rect {
  readonly id: NodeId;
  readonly node: AccountNode;
  readonly kind: NodeKind;
  readonly parentId: NodeId | null;
  readonly depth: number;
  readonly caption: string;
  readonly nameLines: readonly string[];
  /** True when a balance platform sits somewhere above this node. */
  readonly insidePlatform: boolean;
  readonly slots: CardSlots;
}

export interface LayoutEdge {
  readonly id: string;
  readonly parentId: NodeId;
  readonly childId: NodeId;
  readonly path: string;
}

export type LinkRouting = 'lateral' | 'channel';

export interface LayoutLink {
  readonly id: string;
  readonly sourceId: NodeId;
  readonly targetId: NodeId;
  readonly path: string;
  readonly routing: LinkRouting;
  /** Point on the path for a hover affordance, one per endpoint. */
  readonly handles: readonly { readonly nodeId: NodeId; readonly point: Point }[];
  readonly midpoint: Point;
}

export interface Layout {
  readonly nodes: readonly LayoutNode[];
  readonly byId: ReadonlyMap<NodeId, LayoutNode>;
  readonly edges: readonly LayoutEdge[];
  readonly links: readonly LayoutLink[];
  /** Tight box around everything drawn. */
  readonly content: Rect;
  /** `content` plus the export margin. */
  readonly bounds: Rect;
}

interface SizedNode {
  readonly node: AccountNode;
  readonly width: number;
  readonly height: number;
  readonly nameLines: readonly string[];
  readonly caption: string;
  readonly slots: CardSlots;
  readonly children: readonly SizedNode[];
  readonly subtreeWidth: number;
}

/** Extra facts a card shows that only the whole document can answer. */
export interface CardContext {
  /** True when a descendant overrides one of this node's settings. */
  readonly overriddenBelow: boolean;
}

const NO_CONTEXT: CardContext = { overriddenBelow: false };

function chipLabels(node: AccountNode): string[] {
  return node.integrations.map((entry) => integrationLabel(entry.id, entry.version, true));
}

function settingsLabel(node: AccountNode, context: CardContext): string {
  const count = node.settings.length;
  if (count === 0) return '';
  const noun = count === 1 ? 'setting' : 'settings';
  // The asterisk is what tells a company card that an account below disagrees.
  return context.overriddenBelow ? `${count} ${noun} *` : `${count} ${noun}`;
}

/**
 * Packs chips into rows of `innerWidth`, capped at `chipMaxRows`. Chips beyond
 * the cap are dropped rather than shrunk, because an unreadable chip is worse
 * than a missing one and the inspector always lists them all.
 */
function packChips(
  labels: readonly string[],
  innerWidth: number,
  top: number,
  paddingX: number,
  measure: TextMeasurer,
): { chips: ChipBox[]; height: number } {
  const chips: ChipBox[] = [];
  let rowWidth = 0;
  let row = 0;

  for (const label of labels) {
    const width = Math.ceil(measure(label, CARD.chipTextWeight, CARD.chipTextSize)) + CARD.chipPaddingX * 2;
    const needed = rowWidth === 0 ? width : rowWidth + CARD.chipGap + width;
    if (needed > innerWidth && rowWidth > 0) {
      row += 1;
      if (row >= CARD.chipMaxRows) break;
      rowWidth = 0;
    }
    const x = rowWidth === 0 ? paddingX : paddingX + rowWidth + CARD.chipGap;
    chips.push({
      label,
      x,
      y: top + row * (CARD.chipHeight + 4),
      width: Math.min(width, innerWidth),
      height: CARD.chipHeight,
    });
    rowWidth = x - paddingX + Math.min(width, innerWidth);
  }

  const rows = chips.length === 0 ? 0 : row + 1;
  return { chips, height: rows === 0 ? 0 : rows * CARD.chipHeight + (rows - 1) * 4 };
}

/** Method marks in rows, with the leftovers counted rather than drawn. */
function packMethods(
  methods: readonly string[],
  innerWidth: number,
  top: number,
  paddingX: number,
): { methods: MethodBox[]; overflow: number; overflowBox: Rect | null; height: number } {
  const step = CARD.methodWidth + CARD.methodGap;
  const perRow = Math.max(1, Math.floor((innerWidth + CARD.methodGap) / step));
  const capacity = perRow * CARD.methodMaxRows;
  const shown = methods.length > capacity ? methods.slice(0, capacity - 1) : methods;
  const overflow = methods.length - shown.length;

  const boxes: MethodBox[] = shown.map((method, index) => ({
    method,
    x: paddingX + (index % perRow) * step,
    y: top + Math.floor(index / perRow) * (CARD.methodHeight + CARD.methodGap),
    width: CARD.methodWidth,
    height: CARD.methodHeight,
  }));

  let overflowBox: Rect | null = null;
  if (overflow > 0) {
    const index = shown.length;
    overflowBox = {
      x: paddingX + (index % perRow) * step,
      y: top + Math.floor(index / perRow) * (CARD.methodHeight + CARD.methodGap),
      width: CARD.methodOverflowWidth,
      height: CARD.methodHeight,
    };
  }

  const slots = shown.length + (overflow > 0 ? 1 : 0);
  const rows = slots === 0 ? 0 : Math.ceil(slots / perRow);
  const height = rows === 0 ? 0 : rows * CARD.methodHeight + (rows - 1) * CARD.methodGap;
  return { methods: boxes, overflow, overflowBox, height };
}

export function measureCard(
  node: AccountNode,
  parentKind: NodeKind | null,
  measure: TextMeasurer,
  context: CardContext = NO_CONTEXT,
): Omit<SizedNode, 'children' | 'subtreeWidth' | 'node'> {
  const spec = specOf(node.kind);
  const caption = captionFor(node.kind, parentKind);

  const maxTextWidth = CARD.maxWidth - CARD.paddingX * 2;
  const wrapped = wrapText(node.name, maxTextWidth, CARD.nameMaxLines, measure, CARD.nameWeight, CARD.nameSize);
  const captionWidth = measure(caption.toUpperCase(), CARD.captionWeight, CARD.captionSize) + 0.5 * caption.length;

  // An empty terminal row is not reserved: the row would read as dead space on
  // every store and merchant card. Adding the first terminal grows the card.
  const terminalCount = node.terminals.length;
  const showTerminals = spec.supportsTerminals && terminalCount > 0;
  const terminalsWidth = showTerminals
    ? (terminalCount + 1) * CARD.terminalSize + terminalCount * CARD.terminalSpacing
    : 0;

  const labels = spec.supportsIntegrations ? chipLabels(node) : [];
  const widestChip = labels.reduce(
    (widest, label) =>
      Math.max(widest, Math.ceil(measure(label, CARD.chipTextWeight, CARD.chipTextSize)) + CARD.chipPaddingX * 2),
    0,
  );

  const methods = spec.supportsMethods ? node.methods : [];
  // Two marks side by side is the narrowest the row is allowed to force.
  const methodsWidth = methods.length === 0 ? 0 : Math.min(methods.length, 2) * (CARD.methodWidth + CARD.methodGap);

  const badgeLabel = settingsLabel(node, context);
  const badgeWidth =
    badgeLabel === ''
      ? 0
      : Math.ceil(measure(badgeLabel, CARD.badgeTextWeight, CARD.badgeTextSize)) +
        CARD.badgeIconSize +
        CARD.badgeIconGap;

  const contentWidth = Math.max(
    wrapped.width + 1,
    captionWidth,
    terminalsWidth,
    widestChip,
    methodsWidth,
    badgeWidth,
    CARD.iconSize,
  );
  const width = clamp(Math.ceil(contentWidth + CARD.paddingX * 2), CARD.minWidth, CARD.maxWidth);
  const innerWidth = width - CARD.paddingX * 2;

  const iconTop = CARD.paddingTop;
  const nameTop = iconTop + CARD.iconSize + CARD.iconGap;
  const captionTop = nameTop + wrapped.lines.length * CARD.nameLineHeight + CARD.captionGap;

  // Rows only exist when they have content, so a bare card stays compact.
  let cursor = captionTop + CARD.captionLineHeight;

  const chipRow = packChips(labels, innerWidth, cursor + CARD.chipRowGap, CARD.paddingX, measure);
  if (chipRow.height > 0) cursor += CARD.chipRowGap + chipRow.height;

  const methodRow = packMethods(methods, innerWidth, cursor + CARD.methodRowGap, CARD.paddingX);
  if (methodRow.height > 0) cursor += CARD.methodRowGap + methodRow.height;

  const terminalsTop = showTerminals ? cursor + CARD.terminalGap : null;
  if (terminalsTop !== null) cursor = terminalsTop + CARD.terminalRowHeight;

  const badgeTop = badgeLabel === '' ? null : cursor + CARD.badgeGap;
  if (badgeTop !== null) cursor = badgeTop + CARD.badgeHeight;

  const height = Math.ceil(cursor + CARD.paddingBottom);

  return {
    width,
    height,
    nameLines: wrapped.lines,
    caption,
    slots: {
      icon: { x: (width - CARD.iconSize) / 2, y: iconTop, width: CARD.iconSize, height: CARD.iconSize },
      nameTop,
      nameLineHeight: CARD.nameLineHeight,
      captionBaselineTop: captionTop,
      terminalsTop,
      innerWidth,
      logo:
        spec.supportsLogo && node.logoDomain !== ''
          ? { x: (width - CARD.iconSize) / 2, y: iconTop, width: CARD.iconSize, height: CARD.iconSize }
          : null,
      chips: chipRow.chips,
      methods: methodRow.methods,
      methodOverflow: methodRow.overflow,
      methodOverflowBox: methodRow.overflowBox,
      badgeTop,
      badgeLabel,
    },
  };
}

function sizeTree(
  node: AccountNode,
  parentKind: NodeKind | null,
  measure: TextMeasurer,
  contextOf: (node: AccountNode) => CardContext,
): SizedNode {
  const children = node.children.map((child) => sizeTree(child, node.kind, measure, contextOf));
  const card = measureCard(node, parentKind, measure, contextOf(node));

  const childrenWidth =
    children.reduce((total, child) => total + child.subtreeWidth, 0) +
    Math.max(0, children.length - 1) * TREE.siblingGap;

  return {
    node,
    ...card,
    children,
    subtreeWidth: Math.max(card.width, childrenWidth),
  };
}

export interface LayoutOptions {
  readonly measure: TextMeasurer;
}

export function layoutDocument(doc: StructureDocument, options: LayoutOptions): Layout {
  const sized = sizeTree(doc.root, null, options.measure, (node) => {
    // Only nodes that actually set something can be contradicted below, which
    // keeps this off the hot path for the vast majority of cards.
    if (node.settings.length === 0) return NO_CONTEXT;
    const below = keysSetBelow(node);
    return { overriddenBelow: node.settings.some((setting) => below.has(setting.key)) };
  });

  // Rows are as tall as their tallest card so every card in a row shares a top
  // edge, which keeps the connector elbows aligned.
  const rowHeights: number[] = [];
  const collectRowHeights = (item: SizedNode, depth: number): void => {
    rowHeights[depth] = Math.max(rowHeights[depth] ?? 0, item.height);
    item.children.forEach((child) => collectRowHeights(child, depth + 1));
  };
  collectRowHeights(sized, 0);

  const rowTop: number[] = [];
  let cursor = 0;
  for (let depth = 0; depth < rowHeights.length; depth += 1) {
    rowTop[depth] = cursor;
    cursor += (rowHeights[depth] ?? 0) + TREE.rowGap;
  }

  const nodes: LayoutNode[] = [];
  const place = (
    item: SizedNode,
    left: number,
    depth: number,
    parentId: NodeId | null,
    insidePlatform: boolean,
  ): void => {
    const x = left + (item.subtreeWidth - item.width) / 2;
    const y = rowTop[depth] ?? 0;

    nodes.push({
      id: item.node.id,
      node: item.node,
      kind: item.node.kind,
      parentId,
      depth,
      x,
      y,
      width: item.width,
      height: item.height,
      caption: item.caption,
      nameLines: item.nameLines,
      insidePlatform,
      slots: item.slots,
    });

    const childrenWidth =
      item.children.reduce((total, child) => total + child.subtreeWidth, 0) +
      Math.max(0, item.children.length - 1) * TREE.siblingGap;

    let childLeft = left + (item.subtreeWidth - childrenWidth) / 2;
    const childInsidePlatform = insidePlatform || item.node.kind === 'bp';
    for (const child of item.children) {
      place(child, childLeft, depth + 1, item.node.id, childInsidePlatform);
      childLeft += child.subtreeWidth + TREE.siblingGap;
    }
  };
  place(sized, 0, 0, null, false);

  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const edges = buildEdges(nodes, byId, rowTop);
  const links = buildLinks(doc, nodes, byId, rowTop);

  const drawn: Rect[] = nodes.map(({ x, y, width, height }) => ({ x, y, width, height }));
  for (const link of links) {
    drawn.push({ x: link.midpoint.x, y: link.midpoint.y, width: 0, height: 0 });
    for (const handle of link.handles) {
      drawn.push({ x: handle.point.x, y: handle.point.y, width: 0, height: 0 });
    }
  }
  const content = unionRect(drawn);
  const bounds: Rect = {
    x: content.x - TREE.margin,
    y: content.y - TREE.margin,
    width: content.width + TREE.margin * 2,
    height: content.height + TREE.margin * 2,
  };

  return { nodes, byId, edges, links, content, bounds };
}

function buildEdges(
  nodes: readonly LayoutNode[],
  byId: ReadonlyMap<NodeId, LayoutNode>,
  rowTop: readonly number[],
): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  for (const child of nodes) {
    if (child.parentId === null) continue;
    // A balance platform is not owned by the company account: it is reached
    // through the links from the merchant accounts beside it, so it keeps its
    // place in the row but draws no connector upwards.
    if (specOf(child.kind).detached) continue;
    const parent = byId.get(child.parentId);
    if (!parent) continue;

    const fromX = rectCenterX(parent);
    const fromY = rectBottom(parent);
    const toX = rectCenterX(child);
    const toY = child.y;
    const busY = (rowTop[child.depth] ?? toY) - TREE.rowGap / 2;

    const path =
      Math.abs(fromX - toX) < 0.5
        ? `M ${fromX} ${fromY} L ${toX} ${toY}`
        : roundedPolyline(
            [
              { x: fromX, y: fromY },
              { x: fromX, y: busY },
              { x: toX, y: busY },
              { x: toX, y: toY },
            ],
            TREE.elbowRadius,
          );

    edges.push({ id: `${parent.id}->${child.id}`, parentId: parent.id, childId: child.id, path });
  }
  return edges;
}

function buildLinks(
  doc: StructureDocument,
  nodes: readonly LayoutNode[],
  byId: ReadonlyMap<NodeId, LayoutNode>,
  rowTop: readonly number[],
): LayoutLink[] {
  const pairs = collectLinks(doc)
    .map(({ source, target }) => ({ source: byId.get(source), target: byId.get(target) }))
    .filter((pair): pair is { source: LayoutNode; target: LayoutNode } =>
      pair.source !== undefined && pair.target !== undefined,
    );
  if (pairs.length === 0) return [];

  const treeBottom = nodes.reduce((lowest, node) => Math.max(lowest, rectBottom(node)), 0);

  const lateral: typeof pairs = [];
  const channel: typeof pairs = [];
  for (const pair of pairs) {
    if (pair.source.depth === pair.target.depth && isHorizontallyClear(pair.source, pair.target, nodes)) {
      lateral.push(pair);
    } else {
      channel.push(pair);
    }
  }

  const links: LayoutLink[] = [];

  for (const { source, target } of lateral) {
    const sourceIsLeft = rectCenterX(source) <= rectCenterX(target);
    const from: Point = {
      x: sourceIsLeft ? rectRight(source) : source.x,
      y: source.y + source.height / 2,
    };
    const to: Point = {
      x: sourceIsLeft ? target.x : rectRight(target),
      y: target.y + target.height / 2,
    };
    links.push({
      id: `${source.id}~${target.id}`,
      sourceId: source.id,
      targetId: target.id,
      path: horizontalBezier(from, to),
      routing: 'lateral',
      handles: [
        { nodeId: source.id, point: { x: from.x + (sourceIsLeft ? LINKS.handleDistance : -LINKS.handleDistance), y: from.y } },
        { nodeId: target.id, point: { x: to.x + (sourceIsLeft ? -LINKS.handleDistance : LINKS.handleDistance), y: to.y } },
      ],
      midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    });
  }

  // Same-row links that are not neighbours are routed just above the row, in the
  // clear band between the connector bus and the cards.
  const aboveRow = channel.filter((pair) => pair.source.depth === pair.target.depth);
  const belowTree = channel.filter((pair) => pair.source.depth !== pair.target.depth);

  const aboveLanes = assignLanes(
    aboveRow.map(({ source, target }) => ({
      min: Math.min(rectCenterX(source), rectCenterX(target)) - 12,
      max: Math.max(rectCenterX(source), rectCenterX(target)) + 12,
    })),
  );

  aboveRow.forEach(({ source, target }, index) => {
    const lane = aboveLanes[index] ?? 0;
    const channelY = (rowTop[source.depth] ?? source.y) - LINKS.lateralOffset - lane * LINKS.laneHeight;
    const sourceIsLeft = rectCenterX(source) <= rectCenterX(target);
    const fromX = attachX(source, sourceIsLeft ? 1 : -1);
    const toX = attachX(target, sourceIsLeft ? -1 : 1);
    const points: Point[] = [
      { x: fromX, y: source.y },
      { x: fromX, y: channelY },
      { x: toX, y: channelY },
      { x: toX, y: target.y },
    ];
    links.push({
      id: `${source.id}~${target.id}`,
      sourceId: source.id,
      targetId: target.id,
      path: roundedPolyline(points, TREE.elbowRadius),
      routing: 'channel',
      handles: [
        { nodeId: source.id, point: { x: fromX, y: source.y - LINKS.handleDistance } },
        { nodeId: target.id, point: { x: toX, y: target.y - LINKS.handleDistance } },
      ],
      midpoint: { x: (fromX + toX) / 2, y: channelY },
    });
  });

  const belowLanes = assignLanes(
    belowTree.map(({ source, target }) => ({
      min: Math.min(rectCenterX(source), rectCenterX(target)) - 12,
      max: Math.max(rectCenterX(source), rectCenterX(target)) + 12,
    })),
  );

  belowTree.forEach(({ source, target }, index) => {
    const lane = belowLanes[index] ?? 0;
    const channelY = treeBottom + LINKS.channelOffset + lane * LINKS.laneHeight;
    const sourceIsLeft = rectCenterX(source) <= rectCenterX(target);
    const fromX = attachX(source, sourceIsLeft ? 1 : -1);
    const toX = attachX(target, sourceIsLeft ? -1 : 1);
    const points: Point[] = [
      { x: fromX, y: rectBottom(source) },
      { x: fromX, y: channelY },
      { x: toX, y: channelY },
      { x: toX, y: rectBottom(target) },
    ];
    links.push({
      id: `${source.id}~${target.id}`,
      sourceId: source.id,
      targetId: target.id,
      path: roundedPolyline(points, TREE.elbowRadius),
      routing: 'channel',
      handles: [
        { nodeId: source.id, point: { x: fromX, y: rectBottom(source) + LINKS.handleDistance } },
        { nodeId: target.id, point: { x: toX, y: rectBottom(target) + LINKS.handleDistance } },
      ],
      midpoint: { x: (fromX + toX) / 2, y: channelY },
    });
  });

  return links;
}

/**
 * Links attach a little off-centre so they never run along the tree connector
 * that already leaves the card's centre.
 */
function attachX(node: LayoutNode, direction: 1 | -1): number {
  const offset = Math.min(LINKS.attachOffset, node.width / 3);
  return rectCenterX(node) + direction * offset;
}

/** True when no other card in the same row sits between the two nodes. */
function isHorizontallyClear(a: LayoutNode, b: LayoutNode, nodes: readonly LayoutNode[]): boolean {
  const left = Math.min(rectRight(a), rectRight(b));
  const right = Math.max(a.x, b.x);
  if (right <= left) return true;
  return !nodes.some(
    (other) =>
      other.id !== a.id &&
      other.id !== b.id &&
      other.depth === a.depth &&
      rectRight(other) > left &&
      other.x < right,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
