import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { TintName } from '../design/palette';
import { explanationFor, type ExplainTopic } from '../domain/explanations';
import type { NodeKind } from '../domain/kinds';
import { specOf } from '../domain/kinds';
import type { LayoutNode } from '../layout';
import { getViewport, viewportStore, type Viewport } from '../state/viewport';
import { Icon } from './Icon';
import styles from './ExplainCard.module.css';

interface TopicStyle {
  /** Path data for a 24×24 stroked glyph. */
  readonly icon: readonly string[];
  /** Money is green, what customers pay with is orange, insight is blue, setup is grey. */
  readonly tint: TintName;
}

const TOPICS: Record<ExplainTopic, TopicStyle> = {
  reports: {
    tint: 'blue',
    icon: ['M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5', 'M9.5 18v-3M12.5 18v-5M15.5 18v-2'],
  },
  methods: {
    tint: 'orange',
    icon: ['M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z', 'M4 7l11.5-3.5L17 7', 'M15.5 13.5h.01'],
  },
  card: {
    tint: 'orange',
    icon: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18', 'M7 15h4'],
  },
  payout: {
    tint: 'green',
    icon: ['M3 5h13v9H3z', 'M9.5 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M12 19h9', 'M18 16l3 3-3 3'],
  },
  funds: {
    tint: 'green',
    icon: [
      'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z',
      'M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7',
      'M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
    ],
  },
  bank: {
    tint: 'green',
    icon: ['M3 10l9-6 9 6', 'M5 10v8M9.5 10v8M14.5 10v8M19 10v8', 'M3 20h18'],
  },
  capital: {
    tint: 'green',
    icon: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  },
  risk: {
    tint: 'orange',
    icon: ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z', 'M9 12l2 2 4-4'],
  },
  users: {
    tint: 'blue',
    icon: [
      'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
      'M2.5 20a6.5 6.5 0 0 1 13 0',
      'M16 4.6a3.5 3.5 0 0 1 0 6.3',
      'M18 14.3a6.5 6.5 0 0 1 3.5 5.7',
    ],
  },
  verify: {
    tint: 'blue',
    icon: ['M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.5 20a6.5 6.5 0 0 1 10-5.5', 'M15 18l2 2 4-4'],
  },
  invoice: {
    tint: 'grey',
    icon: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6M9 16h3'],
  },
  settings: {
    tint: 'grey',
    icon: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', 'M15 4v4M9 10v4M17 16v4'],
  },
  developer: {
    tint: 'grey',
    icon: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5l-3 14'],
  },
  terminal: {
    tint: 'orange',
    icon: [
      'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
      'M9 6.5h6v3.5H9z',
      'M9.5 14h.01M12 14h.01M14.5 14h.01M9.5 17h.01M12 17h.01M14.5 17h.01',
    ],
  },
  store: {
    tint: 'orange',
    icon: ['M4 10h16v10H4z', 'M3 10l2-6h14l2 6', 'M10 20v-5h4v5'],
  },
  online: {
    tint: 'blue',
    icon: [
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
      'M3 12h18',
      'M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
    ],
  },
  link: {
    tint: 'grey',
    icon: [
      'M9.5 14.5a4 4 0 0 0 5.7.4l2.4-2.4a4 4 0 0 0-5.6-5.7l-1.4 1.4',
      'M14.5 9.5a4 4 0 0 0-5.7-.4l-2.4 2.4a4 4 0 0 0 5.6 5.7l1.4-1.4',
    ],
  },
  industry: {
    tint: 'grey',
    icon: ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'],
  },
};

/** Space between the card and the explanation, and from the screen edge. */
const GAP = 12;
const MARGIN = 12;

/**
 * Places the explanation beside the card: right if it fits, else left, else
 * below or above. It follows pan and zoom through the viewport store directly,
 * the same way the canvas paints its transform, without re-rendering.
 */
function place(element: HTMLElement, container: HTMLElement, item: LayoutNode, viewport: Viewport): void {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const bounds = { width: container.clientWidth, height: container.clientHeight };
  const left = viewport.x + item.x * viewport.scale;
  const top = viewport.y + item.y * viewport.scale;
  const right = left + item.width * viewport.scale;
  const bottom = top + item.height * viewport.scale;
  const clamp = (value: number, max: number): number => Math.max(MARGIN, Math.min(value, max - MARGIN));

  let x: number;
  let y: number;
  if (right + GAP + width <= bounds.width - MARGIN) {
    x = right + GAP;
    y = clamp(top, bounds.height - height);
  } else if (left - GAP - width >= MARGIN) {
    x = left - GAP - width;
    y = clamp(top, bounds.height - height);
  } else {
    x = clamp(left, bounds.width - width);
    y = bottom + GAP + height <= bounds.height - MARGIN ? bottom + GAP : clamp(top - GAP - height, bounds.height - height);
  }
  element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

export interface ExplainCardProps {
  readonly item: LayoutNode;
  readonly parentKind: NodeKind | null;
  readonly containerRef: RefObject<HTMLDivElement | null>;
}

export function ExplainCard({ item, parentKind, containerRef }: ExplainCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const spec = specOf(item.kind);
  const explanation = explanationFor(item.kind, parentKind);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = containerRef.current;
    if (!element || !container) return;
    place(element, container, item, getViewport());
    return viewportStore.subscribe((state) => place(element, container, item, state.viewport));
  }, [containerRef, item]);

  return (
    <div ref={ref} className={`panel ${styles.card}`} role="tooltip">
      <div className={styles.header}>
        <span className={styles.kindTile} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
          <Icon name={spec.icon} tint={spec.tint} size={24} />
        </span>
        <div className={styles.headerText}>
          <div className={styles.caption}>{item.caption}</div>
          <div className={styles.name}>{item.node.name}</div>
        </div>
      </div>

      <p className={styles.summary}>{explanation.summary}</p>

      <ul className={styles.points}>
        {explanation.points.map((point) => {
          const topic = TOPICS[point.topic];
          return (
            <li key={point.title} className={styles.point}>
              <span
                className={styles.topicTile}
                style={{ background: `var(--tint-${topic.tint}-fill)`, color: `var(--tint-${topic.tint}-line)` }}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {topic.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </span>
              <span className={styles.pointText}>
                <strong>{point.title}</strong> {point.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
