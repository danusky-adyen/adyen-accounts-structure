import { describe, expect, it } from 'vitest';
import { addLink, addTerminal, setNote } from '../src/domain/operations';
import { layoutDocument } from '../src/layout';
import { estimateTextWidth } from '../src/layout/measure';
import { buildImagePdf, deflate, rgbaToRgb, supportsFlate } from '../src/export/pdf';
import { renderDiagramSvg } from '../src/export/svg';
import { byName, doc, named, node } from './helpers';

const options = { measure: estimateTextWidth };

/**
 * Minimal well-formedness scan. A full XML parser is not available in the test
 * environment, and the failure this guards against is exactly an attribute
 * value that ends its own quoting (which broke every SVG-derived export once).
 */
function malformedTags(svg: string): string[] {
  const problems: string[] = [];
  const attribute = /^[a-zA-Z][\w:.-]*="[^"]*"\s*/;
  let cursor = 0;

  while (cursor < svg.length) {
    const start = svg.indexOf('<', cursor);
    if (start === -1) break;

    // A tag ends at the first '>' that is not inside a quoted value, so an
    // attribute with an unbalanced quote swallows what follows it.
    let end = start + 1;
    let quoted = false;
    while (end < svg.length && !(svg[end] === '>' && !quoted)) {
      if (svg[end] === '"') quoted = !quoted;
      end += 1;
    }
    if (end >= svg.length) {
      problems.push(svg.slice(start, start + 70));
      break;
    }

    const tag = svg.slice(start + 1, end);
    if (!tag.startsWith('/')) {
      const name = /^[a-zA-Z][\w:-]*/.exec(tag)?.[0];
      if (name === undefined) {
        problems.push(`<${tag.slice(0, 70)}`);
      } else {
        let rest = tag.slice(name.length).replace(/\/$/, '').trim();
        while (rest !== '') {
          const consumed = attribute.exec(rest);
          if (!consumed) {
            problems.push(`<${name} … ${rest.slice(0, 70)}`);
            break;
          }
          rest = rest.slice(consumed[0].length);
        }
      }
    }
    cursor = end + 1;
  }

  return problems;
}

function sample() {
  let document = doc(
    node('company', named('pos', 'Retail NL', named('store', 'Kalverstraat')), named('ecom', 'Webshop')),
  );
  const store = byName(document, 'Kalverstraat');
  document = addTerminal(document, store.id, 'counter');
  document = setNote(document, store.id, 'Flagship');
  document = addLink(document, byName(document, 'Retail NL').id, byName(document, 'Webshop').id);
  return { document, layout: layoutDocument(document, options) };
}

describe('renderDiagramSvg', () => {
  it('produces well-formed markup', () => {
    const { layout } = sample();
    const svg = renderDiagramSvg(layout, { theme: 'light', background: true, title: 'Retail' });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(malformedTags(svg)).toEqual([]);
  });

  it('never lets the font stack break out of its attribute', () => {
    const { layout } = sample();
    const svg = renderDiagramSvg(layout, { theme: 'light', background: true, title: 'Retail' });

    expect(svg).toContain('font-family="');
    expect(svg).not.toMatch(/font-family="[^"]*"[^\s/>]/);
  });

  it('is guarded by a scan that notices an attribute ending its own quoting', () => {
    const broken = '<text font-family="-apple-system, "Inter", sans-serif" x="1">A</text>';
    expect(malformedTags(broken).length).toBeGreaterThan(0);
    expect(malformedTags('<g><text x="1" y="2">A</text><rect width="3"/></g>')).toEqual([]);
  });

  it('draws one text element per name line plus a caption', () => {
    const { layout } = sample();
    const svg = renderDiagramSvg(layout, { theme: 'light', background: false, title: 'Retail' });
    const expected = layout.nodes.reduce((total, item) => total + item.nameLines.length + 1, 0);

    expect(svg.match(/<text /g) ?? []).toHaveLength(expected);
    expect(svg).toContain('>Kalverstraat<');
    // Bento captions are sentence case: no uppercasing, no tracking.
    expect(svg).toContain('>Store<');
  });

  it('escapes text that would otherwise be markup', () => {
    const document = doc(node('company', named('pos', '<script>alert("x")</script> & Co')));
    const layout = layoutDocument(document, options);
    const svg = renderDiagramSvg(layout, { theme: 'light', background: false, title: '<title>&' });

    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(malformedTags(svg)).toEqual([]);
  });

  it('renders an edge per parent link and a path per cross-link', () => {
    const { layout } = sample();
    const svg = renderDiagramSvg(layout, { theme: 'light', background: false, title: 'Retail' });
    const paths = svg.match(/<path /g) ?? [];

    // Three tree edges plus one cross-link, before any icon geometry.
    expect(paths.length).toBeGreaterThan(layout.edges.length + layout.links.length);
    expect(svg).toContain('stroke-dasharray');
  });

  it('follows the theme', () => {
    const { layout } = sample();
    const light = renderDiagramSvg(layout, { theme: 'light', background: true, title: 'Retail' });
    const dark = renderDiagramSvg(layout, { theme: 'dark', background: true, title: 'Retail' });

    expect(light).not.toBe(dark);
    // Bento `background-secondary`, the light-theme canvas.
    expect(light).toContain('#f4f5f6');
    expect(dark).not.toContain('#f4f5f6');
  });

  it('sizes the canvas to the diagram bounds', () => {
    const { layout } = sample();
    const svg = renderDiagramSvg(layout, { theme: 'light', background: true, title: 'Retail' });

    expect(svg).toContain(`width="${Math.ceil(layout.bounds.width)}"`);
    expect(svg).toContain(`height="${Math.ceil(layout.bounds.height)}"`);
  });
});

async function pdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

const image = { data: new Uint8Array([1, 2, 3, 4]), filter: 'DCTDecode' as const, widthPx: 2, heightPx: 1 };
const page = { width: 400, height: 250, title: 'Retail NL' };

describe('buildImagePdf', () => {
  it('writes a header, a single page and a terminator', async () => {
    const text = await pdfText(buildImagePdf(image, page));

    expect(text.startsWith('%PDF-1.7\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/MediaBox [0 0 400 250]');
    expect(text).toContain('/Filter /DCTDecode');
  });

  it('records byte offsets that point at their objects', async () => {
    const text = await pdfText(buildImagePdf(image, page));
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((offset, index) => {
      expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });

  it('scales the image to fill the page', async () => {
    const text = await pdfText(buildImagePdf(image, page));
    expect(text).toContain('400 0 0 250 0 0 cm');
    expect(text).toContain('/Im0 Do');
  });

  it('keeps the image bytes intact and declares their length', async () => {
    const blob = buildImagePdf(image, page);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await pdfText(blob);
    const start = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 'stream\n'.length;

    expect(text).toContain(`/Length ${image.data.length} >>`);
    expect([...bytes.slice(start, start + image.data.length)]).toEqual([1, 2, 3, 4]);
  });

  it('encodes any title without breaking the string syntax', async () => {
    const text = await pdfText(buildImagePdf(image, { ...page, title: ')\\ Ünïcode 😀' }));
    const title = /\/Title <([0-9A-F]+)>/.exec(text)?.[1] ?? '';

    expect(title.startsWith('FEFF')).toBe(true);
    expect(title.length % 4).toBe(0);
    // 11 plain characters plus a surrogate pair for the emoji.
    expect(title.length / 4 - 1).toBe(13);
  });
});

describe('image preparation', () => {
  it('composites alpha over white when dropping the channel', () => {
    const rgba = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0, 200, 100, 50, 128]);
    expect([...rgbaToRgb(rgba)]).toEqual([0, 0, 0, 255, 255, 255, 227, 177, 152]);
  });

  it('deflates into a zlib stream the PDF filter understands', async () => {
    expect(supportsFlate()).toBe(true);
    const compressed = await deflate(new Uint8Array(2048));
    const [first = 0, second = 0] = compressed;

    // zlib header: deflate method, then valid check bits over both bytes.
    expect(first & 0x0f).toBe(8);
    expect(((first << 8) + second) % 31).toBe(0);
    expect(compressed.length).toBeLessThan(2048);
  });
});
