/**
 * Minimal single-image PDF writer.
 *
 * The diagram is already rasterised by us, so a PDF library would only be
 * writing a container: one page, one image XObject. Doing it here removes
 * ~580 kB of lazily-loaded dependencies (jsPDF pulls in html2canvas and
 * DOMPurify) and keeps the output byte-for-byte predictable.
 *
 * Structure written below (PDF 1.7, classic cross-reference table):
 *   1 Catalog → 2 Pages → 3 Page → 4 content stream, 5 image, 6 document info
 */

export type PdfImageFilter = 'FlateDecode' | 'DCTDecode';

export interface PdfImage {
  /** Encoded bytes: a zlib stream of raw RGB samples, or a JPEG file. */
  readonly data: Uint8Array;
  readonly filter: PdfImageFilter;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PdfPage {
  /** Page box in PostScript points (1 pt = 1/72 in). */
  readonly width: number;
  readonly height: number;
  readonly title: string;
}

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

/**
 * PDF text strings have two forms, and the hex/UTF-16BE one needs no escaping
 * of delimiters, so it is the safe choice for arbitrary user titles.
 */
function utf16HexString(text: string): string {
  let hex = 'FEFF';
  for (const unit of text) {
    const code = unit.codePointAt(0) ?? 0;
    if (code > 0xffff) {
      const offset = code - 0x10000;
      hex += (0xd800 + (offset >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (offset & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += code.toString(16).padStart(4, '0');
    }
  }
  return `<${hex.toUpperCase()}>`;
}

/** Rounds to 2 decimals without exponent notation, which PDF forbids. */
const num = (value: number): string => (Math.round(value * 100) / 100).toString();

export function buildImagePdf(image: PdfImage, page: PdfPage): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const write = (text: string): void => push(ascii(text));
  const startObject = (id: number): void => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
  };
  const endObject = (): void => write('endobj\n');

  write('%PDF-1.7\n');
  // Binary comment: marks the file as binary for transfer tools.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObject();

  startObject(2);
  write('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n');
  endObject();

  startObject(3);
  write(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n`,
  );
  endObject();

  // Place the image so it covers the page exactly: the CTM is the image size.
  const content = `q\n${num(page.width)} 0 0 ${num(page.height)} 0 0 cm\n/Im0 Do\nQ\n`;
  startObject(4);
  write(`<< /Length ${content.length} >>\nstream\n${content}endstream\n`);
  endObject();

  startObject(5);
  write(
    `<< /Type /XObject /Subtype /Image /Width ${image.widthPx} /Height ${image.heightPx} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} ` +
      `/Length ${image.data.length} >>\nstream\n`,
  );
  push(image.data);
  write('\nendstream\n');
  endObject();

  startObject(6);
  write(
    `<< /Title ${utf16HexString(page.title)} /Producer ${utf16HexString('Adyen account structure')} >>\n`,
  );
  endObject();

  const objectCount = 7; // objects 1..6 plus the mandatory free entry
  const xrefOffset = length;
  write(`xref\n0 ${objectCount}\n`);
  write('0000000000 65535 f \n');
  for (let id = 1; id < objectCount; id += 1) {
    write(`${(offsets[id] ?? 0).toString().padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${objectCount} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/** True when the browser can produce the zlib stream /FlateDecode expects. */
export function supportsFlate(): boolean {
  return typeof CompressionStream === 'function';
}

export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

/**
 * Drops the alpha channel, compositing over white: PDF image XObjects here are
 * opaque, and the diagram background is already painted in the raster.
 */
export function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const pixels = Math.floor(rgba.length / 4);
  const rgb = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const alpha = (rgba[i * 4 + 3] ?? 255) / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgba[i * 4 + channel] ?? 0;
      rgb[i * 3 + channel] = Math.round(value * alpha + 255 * (1 - alpha));
    }
  }
  return rgb;
}
