import { useMemo } from 'react';
import type { NodeId, StructureDocument } from '../domain/document';
import { layoutDocument, type Layout } from '../layout';
import { createCanvasMeasurer } from '../layout/measure';

/**
 * Recomputes geometry whenever the document or the open groups change. The
 * measurer is created once because it caches text widths across layouts.
 */
export function useLayout(doc: StructureDocument, expandedGroups: ReadonlySet<NodeId>): Layout {
  const measure = useMemo(() => createCanvasMeasurer(), []);
  return useMemo(() => layoutDocument(doc, { measure, expandedGroups }), [doc, measure, expandedGroups]);
}
