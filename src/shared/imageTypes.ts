/**
 * Image file detection — the ONE place that answers "is this path an image, and
 * what mime does it carry?".
 *
 * Shared on purpose. The call sites live on opposite sides of the IPC
 * boundary: the main process stamps a mime onto the bytes it reads
 * (`fs.readFileBinary`), and the markdown renderer and the terminal path links
 * decide whether a path is an image. Keeping the table here makes
 * disagreement impossible.
 *
 * Detection is BY EXTENSION, not by magic bytes. That is deliberate: the
 * renderer must decide what a path is *before* it has any bytes. The mime is
 * only ever used to label a `blob:` URL for the platform's own image decoder —
 * a mislabelled file simply fails to decode and shows an error state, it never
 * becomes a script or a navigation.
 */

/** Extension (lower-case, no dot) → mime type. */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  svg: 'image/svg+xml'
};

/**
 * Lower-cased extension of `p` without the dot, or '' when there is none.
 *
 * Strips a `?query` / `#hash` first: markdown authored by an agent routinely
 * carries cache-busting suffixes (`./shot.png?v=2`), and treating `png?v=2` as
 * the extension would silently drop exactly the screenshots we want to render.
 * Only the LAST path segment is considered, so a dotted directory name
 * (`v1.2/report`) can never masquerade as an extension. For a URL or a
 * markdown link; a filesystem path uses `extensionOf` (askFiles.ts), where a
 * literal `?` is part of the name.
 */
export function urlExtensionOf(p: string): string {
  if (typeof p !== 'string') return '';
  const clean = p.split('#')[0].split('?')[0];
  const base = clean.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** The image mime for an extension (lower-case, no dot), or null. A file on
 *  disk passes `extensionOf` (askFiles.ts), where `#` and `?` are part of the
 *  name, so "Invoice #12.svg" is still an SVG. */
export function imageMimeForExtension(ext: string): string | null {
  return Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext) ? MIME_BY_EXT[ext] : null;
}

/** The image mime for `p`, or null when the extension isn't a known image. */
export function imageMimeForPath(p: string): string | null {
  return imageMimeForExtension(urlExtensionOf(p));
}

/** True when `p` names a raster or vector image we can render. */
export function isImagePath(p: string): boolean {
  return imageMimeForPath(p) !== null;
}
