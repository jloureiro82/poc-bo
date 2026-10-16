import { downloadBlob } from './download';

/**
 * Saves a diagram (plain HTML styled by styles.scss) as an SVG or PNG picture, in the current theme.
 *
 * The diagram is copied into an SVG `foreignObject` with every style written inline, because a picture cannot use the
 * page's style sheet. Pseudo-elements (the split and join bars of decisions are `::before` / `::after`) become real
 * elements, editing controls are left out, and the fonts are embedded so text keeps its width. A PNG is that SVG
 * drawn on a canvas at twice the size.
 */
export async function exportDiagram(source: HTMLElement | SVGSVGElement, format: 'svg' | 'png', fileName: string): Promise<void> {
  const svg = await diagramSvg(source);
  if (format === 'svg') {
    downloadBlob(`${fileName}.svg`, new Blob([svg.text], { type: 'image/svg+xml' }));
    return;
  }
  downloadBlob(`${fileName}.png`, await toPng(svg.text, svg.width, svg.height));
}

/** Leaves out what only makes sense on screen: delete buttons, "+" insert menus, add buttons, link ports. */
const EDIT_CONTROLS = '.task-actions, .insert-after, app-task-template-menu, .node-actions, .port, .edge-hit, .edge-menu, .drag-line';

/** Inherited properties are always written; the rest only when they differ from the browser default. */
const INHERITED = new Set([
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant-ligatures',
  'font-feature-settings',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-transform',
  'text-indent',
  'white-space',
  'visibility',
  'direction',
  'list-style-type',
  '-webkit-font-smoothing',
]);

/** Not useful in a still picture, or harmful there. */
const SKIPPED = /^(transition|animation|cursor|pointer-events|user-select|-webkit-user-select|will-change|caret-color|outline)/;

export async function diagramSvg(source: HTMLElement | SVGSVGElement): Promise<{ text: string; width: number; height: number }> {
  const selected = Array.from(source.querySelectorAll('.selected'));
  selected.forEach(e => e.classList.remove('selected'));
  let clone: HTMLElement | SVGSVGElement;
  try {
    clone = inlineStyles(source);
  } finally {
    selected.forEach(e => e.classList.add('selected'));
  }
  clone.querySelectorAll(EDIT_CONTROLS).forEach(e => e.remove());
  // `zoom` on the viewport scales what is measured on screen; the copy is drawn at 100%
  const natural = source instanceof SVGSVGElement ? source.width.baseVal.value : source.offsetWidth;
  const zoom = source.getBoundingClientRect().width / (natural || 1) || 1;
  const width = Math.ceil(source.getBoundingClientRect().width / zoom);
  const height = Math.ceil(source.getBoundingClientRect().height / zoom);
  clone.style.margin = '0';
  clone.style.width = `${width}px`;
  const background = getComputedStyle(document.body).backgroundColor;
  const fonts = await embeddedFonts();
  const body = new XMLSerializer().serializeToString(clone);
  const text =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (fonts ? `<defs><style>${escapeXml(fonts)}</style></defs>` : '') +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${body}</foreignObject></svg>`;
  return { text, width, height };
}

function inlineStyles<T extends Element>(source: T): T {
  const clone = source.cloneNode(true) as T;
  const originals = [source, ...Array.from(source.querySelectorAll<Element>('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll<Element>('*'))];
  const defaults = new DefaultStyles();
  const pseudos: { copy: Element; before?: HTMLElement; after?: HTMLElement }[] = [];
  try {
    originals.forEach((original, i) => {
      const copy = copies[i];
      if (!(copy instanceof HTMLElement || copy instanceof SVGElement)) {
        return;
      }
      copy.removeAttribute('class');
      copy.removeAttribute('draggable');
      copy.setAttribute('style', styleText(getComputedStyle(original), defaults.of(original.tagName)));
      const entry: (typeof pseudos)[number] = { copy };
      for (const which of ['before', 'after'] as const) {
        const style = getComputedStyle(original, `::${which}`);
        if (style.content && style.content !== 'none' && style.content !== 'normal') {
          const span = document.createElement('span');
          span.setAttribute('style', styleText(style, defaults.of('SPAN')));
          span.textContent = contentText(style.content);
          entry[which] = span;
        }
      }
      if (entry.before || entry.after) {
        pseudos.push(entry);
      }
    });
  } finally {
    defaults.dispose();
  }
  for (const { copy, before, after } of pseudos) {
    if (before) {
      copy.insertBefore(before, copy.firstChild);
    }
    if (after) {
      copy.appendChild(after);
    }
  }
  return clone;
}

function styleText(style: CSSStyleDeclaration, defaults: CSSStyleDeclaration): string {
  const out: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (SKIPPED.test(prop)) {
      continue;
    }
    const value = style.getPropertyValue(prop);
    if (INHERITED.has(prop) || value !== defaults.getPropertyValue(prop)) {
      out.push(`${prop}:${value}`);
    }
  }
  return out.join(';');
}

/** `"↻ "` → `↻ `; `counter(…)` and the like are not supported and give nothing. */
function contentText(content: string): string {
  const m = /^(["'])(.*)\1$/s.exec(content);
  return m ? m[2].replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1') : '';
}

/** Computed styles of unstyled elements, from a blank frame that has no style sheets. */
class DefaultStyles {
  private readonly frame = document.createElement('iframe');
  private readonly cache = new Map<string, CSSStyleDeclaration>();

  constructor() {
    this.frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(this.frame);
  }

  of(tag: string): CSSStyleDeclaration {
    let style = this.cache.get(tag);
    if (!style) {
      const doc = this.frame.contentDocument!;
      const el = doc.createElement(tag);
      doc.body.appendChild(el);
      style = this.frame.contentWindow!.getComputedStyle(el);
      this.cache.set(tag, style);
    }
    return style;
  }

  dispose(): void {
    this.frame.remove();
  }
}

/** The page's @font-face rules, with their files inlined as data URLs. */
async function embeddedFonts(): Promise<string> {
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSFontFaceRule) {
          rules.push(rule);
        }
      }
    } catch {
      // a cross-origin sheet cannot be read; its fonts fall back
    }
  }
  const faces = await Promise.all(
    rules.map(async rule => {
      const base = rule.parentStyleSheet?.href ?? document.baseURI;
      let css = rule.cssText;
      for (const m of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        try {
          const blob = await (await fetch(new URL(m[2], base).href)).blob();
          css = css.replace(m[0], `url(${await dataUrl(blob)})`);
        } catch {
          return '';
        }
      }
      return css;
    }),
  );
  return faces.filter(Boolean).join('\n');
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function toPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The picture could not be drawn'))), 'image/png'));
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
