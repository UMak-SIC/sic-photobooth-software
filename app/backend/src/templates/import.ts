import { validateTemplateDraft, type TemplateDraft } from './types.js';

export type ManifestEntry = {
  template: TemplateDraft;
  backgroundPath: string | null;
  coverPath: string | null;
  overlays: Array<{ id: string | undefined; label: string; path: string | null }>;
};
export type ImportPackage = { version: number; templates: ManifestEntry[] };

export function parseZip(buffer: Buffer): Map<string, Buffer> {
  // ponytail: stored-only entries (method 0), matching our exporter.
  // add DEFLATE support (method 8) if imports of third-party archives are ever needed.
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const contentLength = buffer.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
    files.set(name, buffer.subarray(contentStart, contentStart + contentLength));
    offset = contentStart + contentLength;
  }
  return files;
}

export function parseManifest(entries: Map<string, Buffer>): ImportPackage {
  const manifest = entries.get('manifest.json');
  if (!manifest) throw new Error('Missing manifest.json in archive');
  let raw: unknown;
  try {
    raw = JSON.parse(manifest.toString('utf8'));
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }

  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1)
    throw new Error('Unsupported template archive version');

  const manifestTemplates = (raw as { templates?: unknown }).templates;
  if (!Array.isArray(manifestTemplates) || manifestTemplates.length === 0)
    throw new Error('Archive contains no templates');

  const templates: ManifestEntry[] = [];
  for (const item of manifestTemplates) {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid template in archive');
    const record = item as Record<string, unknown>;
    const draft = validateTemplateDraft(stripPaths(record));
    const backgroundPath = typeof record.backgroundPath === 'string' ? record.backgroundPath : null;
    const coverPath = typeof record.coverPath === 'string' ? record.coverPath : null;
    const overlays = ((record.overlays as Array<Record<string, unknown>> | undefined) ?? []).map(
      (overlay) => ({
        id: typeof overlay.id === 'string' ? overlay.id : undefined,
        label: typeof overlay.label === 'string' ? overlay.label : String(overlay.label ?? ''),
        path: typeof overlay.path === 'string' ? overlay.path : null,
      }),
    );
    assertAssetsExist(entries, [backgroundPath, coverPath, ...overlays.map((o) => o.path)]);
    templates.push({ template: draft, backgroundPath, coverPath, overlays });
  }

  return { version: 1, templates };
}

function stripPaths(record: Record<string, unknown>): Record<string, unknown> {
  const placements = ((record.placements as Array<Record<string, unknown>> | undefined) ?? []).map(
    ({ id: _id, ...placement }) => placement,
  );
  const overlays = ((record.overlays as Array<Record<string, unknown>> | undefined) ?? []).map(
    ({ path: _path, ...overlay }) => overlay,
  );
  return { name: record.name, orientation: record.orientation, background: record.background, placements, overlays };
}

function assertAssetsExist(
  entries: Map<string, Buffer>,
  paths: Array<string | null>,
): void {
  for (const assetPath of paths) {
    if (assetPath && !entries.has(assetPath))
      throw new Error(`Archive is missing asset: ${assetPath}`);
  }
}

export function assetExtension(assetPath: string): 'png' | 'jpg' | 'svg' {
  const extension = assetPath.toLowerCase().split('.').pop();
  if (extension === 'png') return 'png';
  if (extension === 'svg') return 'svg';
  return 'jpg';
}
