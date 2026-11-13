import { memo, type MouseEvent as ReactMouseEvent } from 'react';
import type { NodeId } from '../domain/document';
import type { LayoutGroup } from '../layout';
import { GROUP } from '../layout/metrics';
import styles from './GroupFrame.module.css';

export interface GroupFrameProps {
  readonly group: LayoutGroup;
  readonly dimmed: boolean;
  readonly onToggle: (parentId: NodeId) => void;
}

/**
 * The frame around a grid of compact cards. It draws behind the cards and only
 * its two controls take the pointer, so a press on the frame itself pans the
 * canvas like any other empty space.
 */
export const GroupFrame = memo(function GroupFrame({ group, dimmed, onToggle }: GroupFrameProps) {
  const toggle = (event: ReactMouseEvent): void => {
    event.stopPropagation();
    onToggle(group.parentId);
  };

  return (
    <div
      className={styles.frame}
      style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
      data-group-id={group.id}
      data-dimmed={dimmed}
      role="group"
      aria-label={group.label}
    >
      <div className={styles.header} style={{ height: GROUP.headerHeight, paddingLeft: GROUP.padding, paddingRight: GROUP.padding }}>
        <span className={styles.label} style={{ fontSize: GROUP.labelSize, lineHeight: `${GROUP.labelLineHeight}px` }}>
          {group.label}
        </span>
        {group.collapsible ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={group.expanded}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={toggle}
          >
            {group.expanded ? 'Show fewer' : `Show all ${group.total}`}
            <svg viewBox="0 0 24 24" aria-hidden data-expanded={group.expanded}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : null}
      </div>

      {group.more === null ? null : (
        <button
          type="button"
          className={styles.more}
          style={{
            left: group.more.x - group.x,
            top: group.more.y - group.y,
            width: group.more.width,
            height: group.more.height,
          }}
          aria-label={`Show ${group.hidden} more`}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={toggle}
        >
          +{group.hidden} more
        </button>
      )}
    </div>
  );
});
