// scripts/PdfParser.ts
import { Platform } from 'react-native';

const strToBytes = (s: string): Uint8Array => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};

const findAllBytes = (hay: Uint8Array, needle: Uint8Array): number[] => {
  const out: number[] = [];
  const n = needle.length;
  outer: for (let i = 0; i <= hay.length - n; i++) {
    for (let j = 0; j < n; j++) if (hay[i+j] !== needle[j]) continue outer;
    out.push(i);
  }
  return out;
};

const slice2str = (b: Uint8Array, s: number, e: number): string => {
  let r = '';
  for (let i = s; i < e; i++) r += String.fromCharCode(b[i]);
  return r;
};

// Parse a ToUnicode CMap stream → glyph ID → unicode char map
const parseCMap = (cmap: string): Map<number, string> => {
  const map = new Map<number, string>();
  // beginbfchar ... endbfchar sections
  const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let m: RegExpExecArray | null;
  while ((m = bfcharRegex.exec(cmap)) !== null) {
    const section = m[1];
    // <srcHex> <dstHex>
    const pairs = section.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g) ?? [];
    for (const p of pairs) {
      const parts = p.match(/<([0-9a-fA-F]+)>/g) ?? [];
      if (parts.length >= 2) {
        const src  = parseInt(parts[0].slice(1, -1), 16);
        const dst  = parseInt(parts[1].slice(1, -1), 16);
        map.set(src, String.fromCodePoint(dst));
      }
    }
  }
  // beginbfrange ... endbfrange sections
  const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfrangeRegex.exec(cmap)) !== null) {
    const section = m[1];
    const triples = section.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g) ?? [];
    for (const t of triples) {
      const parts = t.match(/<([0-9a-fA-F]+)>/g) ?? [];
      if (parts.length >= 3) {
        const start = parseInt(parts[0].slice(1, -1), 16);
        const end   = parseInt(parts[1].slice(1, -1), 16);
        let   dst   = parseInt(parts[2].slice(1, -1), 16);
        for (let k = start; k <= end; k++, dst++) {
          map.set(k, String.fromCodePoint(dst));
        }
      }
    }
  }
  return map;
};

// Decode a hex string using a CMap
const decodeWithCMap = (hex: string, cmap: Map<number, string>): string => {
  const h = hex.replace(/\s/g, '');
  let result = '';
  // CID fonts use 2-byte glyph IDs
  for (let i = 0; i < h.length; i += 4) {
    const gid  = parseInt(h.slice(i, i + 4), 16);
    const char = cmap.get(gid);
    if (char) result += char;
  }
  return result;
};

const extractTextMobile = async (fileUri: string): Promise<string> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { unzlibSync, inflateRawSync } = require('fflate');

  const response = await fetch(fileUri);
  const buffer   = await response.arrayBuffer();
  const bytes    = new Uint8Array(buffer);

  const endPos  = findAllBytes(bytes, strToBytes('endstream'));
  const allStrm = findAllBytes(bytes, strToBytes('stream'));
  const strmPos = allStrm.filter(p =>
    p < 3 || slice2str(bytes, p - 3, p) !== 'end'
  );

  // Decompress all streams
  const decompressed: string[] = [];
  for (let i = 0; i < strmPos.length; i++) {
    const end = endPos.find(e => e > strmPos[i]);
    if (!end) { decompressed.push(''); continue; }

    let ds = strmPos[i] + 6;
    if (bytes[ds] === 0x0d) ds++;
    if (bytes[ds] === 0x0a) ds++;
    let de = end;
    if (bytes[de-1] === 0x0a) de--;
    if (bytes[de-1] === 0x0d) de--;
    if (de - ds < 4) { decompressed.push(''); continue; }

    const sb = bytes.slice(ds, de);
    let content = '';
    try { const d = unzlibSync(sb); content = slice2str(d, 0, d.length); }
    catch {
      try { const d = inflateRawSync(sb); content = slice2str(d, 0, d.length); }
      catch { content = slice2str(sb, 0, Math.min(sb.length, 8000)); }
    }
    decompressed.push(content);
  }

  // Build CMap from any ToUnicode streams (contain 'beginbfchar')
  const combinedCMap = new Map<number, string>();
  for (const content of decompressed) {
    if (content.includes('beginbfchar') || content.includes('beginbfrange')) {
      const m = parseCMap(content);
      m.forEach((v, k) => combinedCMap.set(k, v));
    }
  }
  console.log(`📄 CMap entries: ${combinedCMap.size}`);

  // Extract text from page content streams using the CMap
  const chunks: string[] = [];
  for (let i = 0; i < decompressed.length; i++) {
    const content = decompressed[i];
    if (!content.includes('BT') && !content.includes('Tj') && !content.includes('TJ')) continue;

    // <hex> Tj decoded with CMap
    for (const m of content.match(/<([0-9a-fA-F\s]{4,})>\s*Tj/g) ?? []) {
      const h = m.match(/<([^>]*)>/)?.[1] ?? '';
      const t = combinedCMap.size > 0
        ? decodeWithCMap(h, combinedCMap)
        : h;
      if (/[a-zA-Z]{2,}/.test(t)) chunks.push(t);
    }

    // [<hex>...] TJ decoded with CMap
    for (const m of content.match(/\[([^\]]{1,1000})\]\s*TJ/g) ?? []) {
      const inner = m.match(/\[([^\]]*)\]/)?.[1] ?? '';
      let word = '';
      for (const h of inner.match(/<([0-9a-fA-F\s]*)>/g) ?? []) {
        const hex = h.slice(1, -1);
        word += combinedCMap.size > 0
          ? decodeWithCMap(hex, combinedCMap)
          : hex;
      }
      if (/[a-zA-Z]{2,}/.test(word)) chunks.push(word);
    }

    // Plain (text) Tj — some streams still use this
    for (const m of content.match(/\(([^)]{1,200})\)\s*Tj/g) ?? []) {
      const t = m.match(/\(([^)]*)\)/)?.[1] ?? '';
      if (/[a-zA-Z]{2,}/.test(t)) chunks.push(t.trim());
    }
  }

  const result = chunks.join(' ').replace(/\s+/g, ' ').trim();
  console.log(`📄 Extracted ${result.length} chars`);
  console.log(`📄 Sample: "${result.slice(0, 300)}"`);
  return result;
};

const extractTextWeb = async (fileUri: string): Promise<string> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  const pdf    = await pdfjsLib.getDocument({ url: fileUri }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: { str: string }) => item.str).join(' '));
  }
  const full = pages.join('\n');
  console.log(`📄 Parsed ${pdf.numPages} page(s), ${full.length} chars.`);
  return full;
};

export const extractTextFromOfflinePDF = async (fileUri: string): Promise<string> => {
  if (!fileUri) return '';
  try {
    return Platform.OS === 'web'
      ? await extractTextWeb(fileUri)
      : await extractTextMobile(fileUri);
  } catch (e) {
    console.error('🚨 PDF parse error:', e);
    return '';
  }
};