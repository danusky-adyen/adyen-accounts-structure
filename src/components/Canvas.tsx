import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { specOf, type NodeKind } from '../domain/kinds';
import type { Layout } from '../layout';
import { dropCandidates, resolveDropTarget } from '../interaction/dropTarget';
import { useStore } from '../state/store';
import { getViewport, setViewport, viewportStore, type Viewport } from '../state/viewport';
import { usePaymentLogos } from '../hooks/useBrandMarks';
import type { ViewportController } from '../hooks/useViewport';
import { useTileMotion, type TileMotionRefs } from '../hooks/useTileMotion';
import { EdgeLayer } from './EdgeLayer';
import { ExplainCard } from './ExplainCard';
import { Intro } from './Intro';
import { NodeCard } from './NodeCard';
import styles from './Canvas.module.css';

/**
 * Capturing keeps a drag alive when the pointer leaves the window. It is taken
 * only once a gesture turns into a drag: capturing on `pointerdown` would
 * re-target the following `click` and `dblclick` at the capturing element,
 * which stops a card from being renamed on double-click.
 */
function capturePointer(element: HTMLElement | null, pointerId: number): void {
  try {
    element?.setPointerCapture(pointerId);
  } catch {
    // Losing capture only means moves outside the canvas stop arriving.
  }
}

const DRAG_THRESHOLD_PX = 5;
const GRID_SIZE = 26;

interface PanInteraction {
  readonly kind: 'pan';
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startViewport: Viewport;
  moved: boolean;
}

interface NodeInteraction {
  readonly kind: 'node';
  readonly pointerId: number;
  readonly nodeId: string;
  readonly startClientX: number;
  readonly startClientY: number;
  moved: boolean;
}

type Interaction = PanInteraction | NodeInteraction;

/**
 * Writes the viewport onto the DOM. Pan and zoom never go through a React
 * render, so a frame costs one style write however many cards there are.
 */
function paintViewport(world: HTMLElement, grid: HTMLElement, viewport: Viewport): void {
  world.style.transform = `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`;
  const size = GRID_SIZE * viewport.scale;
  grid.style.backgroundSize = `${size}px ${size}px`;
  grid.style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
  grid.style.opacity = viewport.scale < 0.5 ? '0.4' : '1';
}

export interface IntroState {
  /** Bumped for every play, so each one starts from scratch. */
  readonly key: number;
  /** `assemble` while the shapes form, `reveal` while the cards fade in. */
  readonly phase: 'assemble' | 'reveal';
}

export interface CanvasProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly layout: Layout;
  readonly view: ViewportController;
  readonly intro: IntroState | null;
  readonly onIntroReveal: () => void;
  readonly onIntroDone: () => void;
  readonly onRequestTerminalPicker: (nodeId: string) => void;
}

export function Canvas({
  containerRef,
  layout,
  view,
  intro,
  onIntroReveal,
  onIntroDone,
  onRequestTerminalPicker,
}: CanvasProps) {
  const doc = useStore((state) => state.doc);
  const selectedId = useStore((state) => state.selectedId);
  const editingId = useStore((state) => state.editingId);
  const editingSeed = useStore((state) => state.editingSeed);
  const hoveredLinkId = useStore((state) => state.hoveredLinkId);
  const drag = useStore((state) => state.drag);
  const explainMode = useStore((state) => state.explainMode);

  const select = useStore((state) => state.select);
  const setEditing = useStore((state) => state.setEditing);
  const setHoveredLink = useStore((state) => state.setHoveredLink);
  const setDrag = useStore((state) => state.setDrag);
  const rename = useStore((state) => state.rename);
  const addChild = useStore((state) => state.addChild);
  const cycleKind = useStore((state) => state.cycleKind);
  const remove = useStore((state) => state.remove);
  const removeTerminalAt = useStore((state) => state.removeTerminalAt);
  const toggleLink = useStore((state) => state.toggleLink);
  const move = useStore((state) => state.move);
  const notify = useStore((state) => state.notify);

  const interaction = useRef<Interaction | null>(null);
  const [panning, setPanning] = useState(false);
  /** The card under the pointer, explained while Explain mode is on. */
  const [explainedId, setExplainedId] = useState<string | null>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const ghostCardsRef = useRef<HTMLDivElement>(null);
  const ghostEdgesRef = useRef<SVGGElement>(null);
  const motionRefs = useMemo(
    (): TileMotionRefs => ({ tree: treeRef, edges: worldRef, ghostCards: ghostCardsRef, ghostEdges: ghostEdgesRef }),
    [],
  );
  useTileMotion(layout, motionRefs, intro !== null);

  useLayoutEffect(() => {
    const world = worldRef.current;
    const grid = gridRef.current;
    if (!world || !grid) return;
    paintViewport(world, grid, getViewport());
    return viewportStore.subscribe((state) => paintViewport(world, grid, state.viewport));
  }, []);

  const candidates = useMemo(
    () => (drag ? dropCandidates(doc, layout, drag.nodeId) : null),
    [doc, layout, drag],
  );

  // The vendored logo module is only worth fetching once a card shows a method.
  const showsMethods = useMemo(() => layout.nodes.some((item) => item.slots.methods.length > 0), [layout.nodes]);
  const paymentLogos = usePaymentLogos(showsMethods);

  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of layout.links) {
      counts.set(link.sourceId, (counts.get(link.sourceId) ?? 0) + 1);
      counts.set(link.targetId, (counts.get(link.targetId) ?? 0) + 1);
    }
    return counts;
  }, [layout.links]);

  const handleCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      // A finger has no hover, so on touch a tap is what asks for the explanation.
      if (event.pointerType === 'touch') setExplainedId(id);
      interaction.current = {
        kind: 'node',
        pointerId: event.pointerId,
        nodeId: id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };
      // Read at press time so the handler, and every card holding it, stays
      // the same object when the selection moves.
      if (useStore.getState().selectedId !== id) select(id);
    },
    [select],
  );

  const handleCancelEdit = useCallback(() => setEditing(null), [setEditing]);

  const handleBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 1) return;
      if (event.pointerType === 'touch') setExplainedId(null);
      interaction.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: getViewport(),
        moved: false,
      };
      setPanning(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = interaction.current;
      if (current?.pointerId !== event.pointerId) return;

      const dx = event.clientX - current.startClientX;
      const dy = event.clientY - current.startClientY;

      if (current.kind === 'pan') {
        if (!current.moved && Math.hypot(dx, dy) < 2) return;
        if (!current.moved) capturePointer(containerRef.current, event.pointerId);
        current.moved = true;
        setViewport({
          scale: current.startViewport.scale,
          x: current.startViewport.x + dx,
          y: current.startViewport.y + dy,
        });
        return;
      }

      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!current.moved) capturePointer(containerRef.current, event.pointerId);
      current.moved = true;

      const pointer = view.toCanvas(event.clientX, event.clientY);
      const target = resolveDropTarget(doc, layout, current.nodeId, pointer);
      setDrag({ nodeId: current.nodeId, pointer, target });
    },
    [containerRef, doc, layout, setDrag, view],
  );

  const finishInteraction = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = interaction.current;
      interaction.current = null;
      setPanning(false);
      if (current?.pointerId !== event.pointerId) return;

      if (current.kind === 'pan') {
        if (!current.moved) {
          select(null);
          setEditing(null);
        }
        return;
      }

      const active = useStore.getState().drag;
      setDrag(null);
      if (!current.moved || !active) return;

      const target = active.target;
      if (!target) return;

      if (target.action === 'link') {
        toggleLink(active.nodeId, target.nodeId);
        notify('Linked', 'success');
        return;
      }
      move(active.nodeId, target.nodeId, target.action);
    },
    [move, notify, select, setDrag, setEditing, toggleLink],
  );

  // A click asks for one specific card, so it selects what it created (⇧↓
  // deliberately does not). The sidebar is left as it was: popping it open on
  // every add gets in the way of building out a tree.
  const handleAddChild = useCallback(
    (id: string, kind?: NodeKind) => {
      const created = addChild(id, kind);
      if (created) select(created, { inspect: false });
    },
    [addChild, select],
  );

  const handleAddLegalEntity = useCallback((id: string) => handleAddChild(id, 'legalEntity'), [handleAddChild]);

  const handleCommitName = useCallback(
    (id: string, name: string) => {
      rename(id, name);
      setEditing(null);
    },
    [rename, setEditing],
  );

  const handleRemoveLink = useCallback(
    (sourceId: string, targetId: string) => {
      toggleLink(sourceId, targetId);
      setHoveredLink(null);
    },
    [setHoveredLink, toggleLink],
  );

  const handlePointerOver = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const card = (event.target as Element).closest<HTMLElement>('[data-node-id]');
    setExplainedId(card?.dataset['nodeId'] ?? null);
  }, []);

  const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') setExplainedId(null);
  }, []);

  const explained =
    explainMode && intro === null && !panning && drag === null && explainedId !== null
      ? (layout.nodes.find((item) => item.id === explainedId) ?? null)
      : null;
  const explainedParentId = explained?.parentId ?? null;
  const explainedParentKind =
    explainedParentId === null ? null : (layout.nodes.find((item) => item.id === explainedParentId)?.kind ?? null);

  const activeNodeId = drag?.nodeId ?? selectedId;

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      data-panning={panning}
      data-intro={intro?.phase}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onPointerOver={handlePointerOver}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={view.fit}
    >
      <div ref={gridRef} className={styles.grid} />

      {intro === null ? null : (
        <Intro key={intro.key} layout={layout} onReveal={onIntroReveal} onDone={onIntroDone} />
      )}

      <div ref={worldRef} className={styles.world}>
        <svg className={styles.ghosts} aria-hidden>
          <g ref={ghostEdgesRef} />
        </svg>

        <EdgeLayer
          layout={layout}
          activeNodeId={activeNodeId}
          hoveredLinkId={hoveredLinkId}
          dragSourceId={drag?.nodeId ?? null}
          dragPointer={drag?.pointer ?? null}
          dropTarget={drag?.target ?? null}
          onLinkHover={setHoveredLink}
          onLinkRemove={handleRemoveLink}
        />

        <div ref={ghostCardsRef} className={styles.ghosts} aria-hidden />

        <div ref={treeRef} className={styles.tree} role="tree" aria-label="Account structure">
          {layout.nodes.map((item) => {
            const target = drag?.target ?? null;
            const dropAction =
              target !== null &&
              target.nodeId === item.id &&
              (target.action === 'link' || target.action === 'inside')
                ? target.action
                : null;
            return (
              <NodeCard
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                editing={editingId === item.id}
                dragging={drag?.nodeId === item.id}
                dimmed={candidates !== null && !candidates.all.has(item.id) && drag?.nodeId !== item.id}
                dropAction={dropAction}
                editingSeed={editingSeed}
                linkCount={linkCounts.get(item.id) ?? 0}
                paymentLogos={paymentLogos}
                tabbable={selectedId === null ? specOf(item.kind).isRoot : selectedId === item.id}
                onPointerDown={handleCardPointerDown}
                onStartEdit={setEditing}
                onCommitName={handleCommitName}
                onCancelEdit={handleCancelEdit}
                onAddChild={handleAddChild}
                onCycleKind={cycleKind}
                onAddLegalEntity={handleAddLegalEntity}
                onDelete={remove}
                onOpenTerminalPicker={onRequestTerminalPicker}
                onRemoveTerminal={removeTerminalAt}
              />
            );
          })}
        </div>
      </div>

      {explained === null ? null : (
        <ExplainCard item={explained} parentKind={explainedParentKind} containerRef={containerRef} />
      )}
    </div>
  );
}
