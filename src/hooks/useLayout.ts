import { useMemo, useState } from 'react';
import type { NodeId, StructureDocument } from '../domain/document';
import { layoutDocument, type Layout } from '../layout';
import { chooseAnchors, type LaidOut } from '../layout/anchor';
import { createCanvasMeasurer } from '../layout/measure';

/**
 * Recomputes geometry whenever the document or the open groups change. The
 * measurer is created once because it caches text widths across layouts.
 *
 * Each layout is pinned to the one before it (see `layout/anchor.ts`), which
 * is why the previous result is kept in state: it is derived during render,
 * the way React recommends for values that depend on the previous props.
 */
export function useLayout(doc: StructureDocument, expandedGroups: ReadonlySet<NodeId>): Layout {
  const measure = useMemo(() => createCanvasMeasurer(), []);
  const [current, setCurrent] = useState<LaidOut>(() => ({
    doc,
    expandedGroups,
    layout: layoutDocument(doc, { measure, expandedGroups }),
  }));

  if (current.doc === doc && current.expandedGroups === expandedGroups) return current.layout;

  const layout = layoutDocument(doc, { measure, expandedGroups, anchors: chooseAnchors(current, doc, expandedGroups) });
  setCurrent({ doc, expandedGroups, layout });
  return layout;
}
