import { memo, useMemo } from 'react';
import type { NodeId } from '../domain/document';
import type { Layout } from '../layout';
import type { Point } from '../layout/geometry';
import type { DropTarget } from '../state/store';
import styles from './EdgeLayer.module.css';

export interface EdgeLayerProps {
  readonly layout: Layout;
  readonly activeNodeId: NodeId | null;
  readonly hoveredLinkId: string | null;
  readonly dragSourceId: NodeId | null;
  readonly dragPointer: Point | null;
  readonly dropTarget: DropTarget | null;
  readonly onLinkHover: (linkId: string | null) => void;
  readonly onLinkRemove: (sourceId: NodeId, targetId: NodeId) => void;
}

/**
 * Draws every connector in a single SVG layer positioned in the same coordinate
 * space as the cards, so tree edges, cross-links and drag feedback cannot fall
 * out of sync with the layout.
 */
export const EdgeLayer = memo(function EdgeLayer({
  layout,
  activeNodeId,
  hoveredLinkId,
  dragSourceId,
  dragPointer,
  dropTarget,
  onLinkHover,
  onLinkRemove,
}: EdgeLayerProps) {
  /** Ids in the subtree below the active node: their connectors light up. */
  const activeSubtree = useMemo(() => {
    if (activeNodeId === null) return null;
    const ids = new Set<NodeId>([activeNodeId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of layout.nodes) {
        if (node.parentId !== null && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [activeNodeId, layout.nodes]);

  const dragSource = dragSourceId === null ? null : layout.byId.get(dragSourceId) ?? null;
  const insertion = useMemo(() => {
    if (!dropTarget || (dropTarget.action !== 'before' && dropTarget.action !== 'after')) return null;
    const target = layout.byId.get(dropTarget.nodeId);
    if (!target) return null;
    const x = dropTarget.action === 'before' ? target.x - 9 : target.x + target.width + 5;
    return { x, y: target.y - 4, height: target.height + 8 };
  }, [dropTarget, layout.byId]);

  return (
    <svg className={styles.layer} aria-hidden>
      <g>
        {layout.edges.map((edge) => {
          const highlighted = activeSubtree?.has(edge.parentId) ?? false;
          return (
            <path
              key={edge.id}
              d={edge.path}
              className={highlighted ? `${styles.edge} ${styles.edgeActive}` : styles.edge}
            />
          );
        })}
      </g>

      <g>
        {layout.links.map((link) => {
          const active =
            hoveredLinkId === link.id || activeNodeId === link.sourceId || activeNodeId === link.targetId;
          return (
            <g key={link.id}>
              <path
                d={link.path}
                className={styles.linkHitArea}
                onPointerEnter={() => onLinkHover(link.id)}
                onPointerLeave={() => onLinkHover(null)}
              />
              <path d={link.path} className={active ? `${styles.link} ${styles.linkActive}` : styles.link} />
              {link.handles.map((handle) => (
                <g
                  key={`${link.id}-${handle.nodeId}`}
                  className={active ? `${styles.handle} ${styles.handleVisible}` : styles.handle}
                  transform={`translate(${handle.point.x}, ${handle.point.y})`}
                  role="button"
                  tabIndex={-1}
                  aria-label="Remove link"
                  onPointerEnter={() => onLinkHover(link.id)}
                  onPointerLeave={() => onLinkHover(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLinkRemove(link.sourceId, link.targetId);
                  }}
                >
                  <circle r={10} className={styles.handleDisc} />
                  <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" className={styles.handleGlyph} />
                </g>
              ))}
            </g>
          );
        })}
      </g>

      {dragSource && dragPointer && dropTarget?.action === 'link' ? (
        <path
          className={styles.dragPreview}
          d={`M ${dragSource.x + dragSource.width / 2} ${dragSource.y + dragSource.height / 2} L ${dragPointer.x} ${dragPointer.y}`}
        />
      ) : null}

      {insertion ? (
        <rect
          className={styles.insertion}
          x={insertion.x}
          y={insertion.y}
          width={4}
          height={insertion.height}
          rx={2}
        />
      ) : null}
    </svg>
  );
});
