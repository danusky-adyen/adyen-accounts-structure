/**
 * Export pipeline. Everything derives from the same SVG string, so PNG and PDF
 * cannot disagree with what the canvas shows.
 */

import { loadCompanyLogo, loadPaymentLogos } from '../design/brand';
import type { ThemeName } from '../design/palette';
import type { StructureDocument } from '../domain/document';
import type { Layout } from '../layout';
import { buildImagePdf, deflate, rgbaToRgb, supportsFlate, type PdfImage } from './pdf';
import { renderDiagramSvg } from './svg';

export interface ExportContext {
  readonly layout: Layout;
  readonly theme: ThemeName;
  readonly title: string;
}

const PNG_SCALE = 2.5;
/** Enough to keep text crisp without the file size of a lossless export. */
const JPEG_QUALITY = 0.92;

function fileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug === '' ? 'account-structure' : slug}.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Give Safari a moment to start the download before the URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function buildSvg({ layout, theme, title }: ExportContext): string {
  return renderDiagramSvg(layout, { theme, background: true, title });
}

/**
 * Makes sure every brand mark is in memory before the diagram is serialised.
 * The renderer reads them synchronously, and an image-loaded SVG cannot fetch
 * anything itself, so whatever is missing here is missing from the file.
 */
async function withBrandMarks(context: ExportContext): Promise<void> {
  const needsPaymentLogos = context.layout.nodes.some((item) => item.slots.methods.length > 0);
  const domains = new Set(
    context.layout.nodes
      .filter((item) => item.slots.logo !== null)
      .map((item) => item.node.logoDomain),
  );

  await Promise.all([
    needsPaymentLogos ? loadPaymentLogos() : Promise.resolve(),
    ...[...domains].map((domain) => loadCompanyLogo(domain)),
  ]);
}

/**
 * The document itself, indented so it can be read and edited. It is the shape
 * *Build* accepts, so an exported file can be changed by hand or by a model and
 * pasted straight back in.
 */
export function exportJson(doc: StructureDocument, title: string): void {
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  download(new Blob([json], { type: 'application/json;charset=utf-8' }), fileName(title, 'json'));
}

export async function exportSvg(context: ExportContext): Promise<void> {
  await withBrandMarks(context);
  const svg = buildSvg(context);
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileName(context.title, 'svg'));
}

async function renderToCanvas(context: ExportContext, scale: number): Promise<HTMLCanvasElement> {
  await withBrandMarks(context);
  const svg = buildSvg(context);
  const { width, height } = context.layout.bounds;

  const image = new Image();
  image.decoding = 'sync';
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not rasterise the diagram'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context2d = canvas.getContext('2d');
  if (!context2d) throw new Error('Canvas is unavailable');
  // JPEG has no alpha, so anything transparent would come out black.
  context2d.fillStyle = '#ffffff';
  context2d.fillRect(0, 0, canvas.width, canvas.height);
  context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function rasterise(context: ExportContext, scale: number, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const canvas = await renderToCanvas(context, scale);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new Error('Could not encode the image');
  return blob;
}

async function canvasToPdfImage(canvas: HTMLCanvasElement): Promise<PdfImage> {
  const size = { widthPx: canvas.width, heightPx: canvas.height };

  if (supportsFlate()) {
    const context2d = canvas.getContext('2d');
    if (!context2d) throw new Error('Canvas is unavailable');
    const { data } = context2d.getImageData(0, 0, canvas.width, canvas.height);
    return { ...size, filter: 'FlateDecode', data: await deflate(rgbaToRgb(data)) };
  }

  // Fallback for browsers without CompressionStream: JPEG embeds as-is.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('Could not encode the image');
  return { ...size, filter: 'DCTDecode', data: new Uint8Array(await blob.arrayBuffer()) };
}

export async function exportPng(context: ExportContext): Promise<void> {
  const blob = await rasterise(context, PNG_SCALE, 'image/png');
  download(blob, fileName(context.title, 'png'));
}

export async function exportJpeg(context: ExportContext): Promise<void> {
  const blob = await rasterise(context, PNG_SCALE, 'image/jpeg');
  download(blob, fileName(context.title, 'jpg'));
}

export async function copyPngToClipboard(context: ExportContext): Promise<void> {
  const blob = await rasterise(context, PNG_SCALE, 'image/png');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function exportPdf(context: ExportContext): Promise<void> {
  const canvas = await renderToCanvas(context, PNG_SCALE);
  const image = await canvasToPdfImage(canvas);
  const { width, height } = context.layout.bounds;
  const pdf = buildImagePdf(image, { width, height, title: context.title });
  download(pdf, fileName(context.title, 'pdf'));
}
