import { useMemo } from 'react';
import type { StructureDocument } from '../domain/document';
import { layoutDocument, type Layout } from '../layout';
import { createCanvasMeasurer } from '../layout/measure';

/**
 * Recomputes geometry whenever the document changes. The measurer is created
 * once because it caches text widths across layouts.
 */
export function useLayout(doc: StructureDocument): Layout {
  const measure = useMemo(() => createCanvasMeasurer(), []);
  return useMemo(() => layoutDocument(doc, { measure }), [doc, measure]);
}
