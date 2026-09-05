import { describe, expect, it } from 'vitest';
import { isTemplateId, mapTemplate, mergeOverlayAssetPaths } from '../src/templates/repository.js';
import { validateTemplateDraft, type Template } from '../src/templates/types.js';
import { duplicateName, toTemplateDto } from '../src/templates/routes.js';
import { zip } from '../src/templates/zip.js';
import { parseZip, parseManifest, assetExtension } from '../src/templates/import.js';
import { TemplateStorage } from '../src/templates/storage.js';

const placement = {
  captureIndex: 1,
  x: 0,
  y: 0,
  width: 160,
  height: 90,
  rotation: 0,
  borderRadius: 0,
  zIndex: 1,
};

describe('template persistence boundaries', () => {
  it('rejects route names before querying a UUID template id', () => {
    expect(isTemplateId('edit')).toBe(false);
    expect(isTemplateId('22222222-2222-4222-8222-222222222222')).toBe(true);
  });

  it('accepts relative database asset paths when removing assets', async () => {
    const storage = new TemplateStorage();

    await expect(storage.removeAsset('templates/background.png')).resolves.toBeUndefined();
    await expect(storage.removeAsset('../outside.png')).rejects.toThrow(
      'Invalid template asset path',
    );
  });

  it('generates the next available duplicate name', () => {
    expect(duplicateName('Party', ['Party', 'Party_(1)', 'Party_(2)'])).toBe('Party_(3)');
  });

  it('writes a portable ZIP with every entry intact', async () => {
    async function* entries() {
      yield { name: 'manifest.json', content: Buffer.from('{"version":1}') };
      yield { name: 'assets/template/background.png', content: Buffer.from([1, 2, 3]) };
      yield { name: 'assets/template/overlay.svg', content: Buffer.from('<svg />') };
    }
    const parts: Buffer[] = [];
    for await (const part of zip(entries())) parts.push(part);
    const archive = Buffer.concat(parts);
    const files = new Map<string, Buffer>();
    let offset = 0;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const nameLength = archive.readUInt16LE(offset + 26);
      const contentLength = archive.readUInt32LE(offset + 18);
      const start = offset + 30 + nameLength;
      const name = archive.toString('utf8', offset + 30, start);
      files.set(name, archive.subarray(start, start + contentLength));
      offset = start + contentLength;
    }

    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    expect(files.get('manifest.json')?.toString()).toBe('{"version":1}');
    expect(files.get('assets/template/background.png')).toEqual(Buffer.from([1, 2, 3]));
    expect(files.get('assets/template/overlay.svg')?.toString()).toBe('<svg />');
  });

  it('normalizes numeric PostgreSQL values when loading a template', () => {
    const template = mapTemplate(
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Loaded',
        orientation: 'portrait',
        output_width: 1200,
        output_height: 1800,
        background_path: null,
        background_x: 0,
        background_y: 0,
        background_width: 1200,
        background_height: 1800,
        is_active: false,
        required_capture_count: 1,
        sort_order: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      [
        {
          id: 'placement-id',
          captureIndex: '1',
          x: '0',
          y: '0',
          width: '160',
          height: '90',
          rotation: '0',
          borderRadius: '0',
          zIndex: '1',
        },
      ],
      [
        {
          id: 'overlay-id',
          label: 'logo',
          x: '10',
          y: '20',
          width: '240',
          height: '160',
          rotation: '0',
          zIndex: '2',
        },
      ],
    );

    expect(template.placements[0]).toMatchObject({
      captureIndex: 1,
      x: 0,
      y: 0,
      width: 160,
      height: 90,
      rotation: 0,
      borderRadius: 0,
      zIndex: 1,
    });
    expect(template.overlays[0]).toMatchObject({ width: 240, height: 240 });
    expect(template.sortOrder).toBe(2);
  });

  it('returns relative asset URLs instead of filesystem paths', () => {
    const template = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Assets',
      orientation: 'portrait',
      width: 1200,
      height: 1800,
      active: true,
      requiredCaptureCount: 1,
      backgroundPath: '/var/lib/photobooth/templates/background.svg',
      sortOrder: 1,
      background: { x: 0, y: 0, width: 2000, height: 2400 },
      placements: [placement],
      overlays: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          label: 'logo',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          zIndex: 1,
          path: '/var/lib/photobooth/templates/logo.svg',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Template;

    const dto = toTemplateDto(template);
    expect(dto.backgroundPath).toBe('/templates/22222222-2222-4222-8222-222222222222/background');
    expect(dto.overlays[0].path).toBe(
      '/templates/22222222-2222-4222-8222-222222222222/overlays/33333333-3333-4333-8333-333333333333',
    );
    expect(JSON.stringify(dto)).not.toContain('/var/lib/photobooth');
  });

  it('keeps asset paths for identified overlays and clears them for new overlays', () => {
    const overlays = mergeOverlayAssetPaths(
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'kept',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          zIndex: 1,
        },
        { label: 'new', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 2 },
      ],
      [{ id: '11111111-1111-4111-8111-111111111111', path: '/safe/templates/overlay.svg' }],
    );

    expect(overlays[0].path).toBe('/safe/templates/overlay.svg');
    expect(overlays[1].path).toBeNull();
  });

  it('allows background transforms larger than the canvas and rejects client paths', () => {
    expect(() =>
      validateTemplateDraft({
        name: 'Wide background',
        orientation: 'portrait',
        background: { x: -20, y: 0, width: 2000, height: 2400 },
        placements: [placement],
        overlays: [],
      }),
    ).not.toThrow();

    expect(() =>
      validateTemplateDraft({
        name: 'Unsafe path',
        orientation: 'portrait',
        background: { x: 0, y: 0, width: 1200, height: 1800 },
        placements: [placement],
        overlays: [{ ...placement, label: 'overlay', path: '/tmp/file.svg' }],
      }),
    ).toThrow();

    expect(() =>
      validateTemplateDraft({
        name: 'Square slot',
        orientation: 'portrait',
        background: { x: 0, y: 0, width: 1200, height: 1800 },
        placements: [{ ...placement, width: 100, height: 100 }],
        overlays: [],
      }),
    ).not.toThrow();
  });

  it('accepts fixed overlay dimensions with editable position and rotation', () => {
    expect(() =>
      validateTemplateDraft({
        name: 'Overlay template',
        orientation: 'portrait',
        background: { x: 0, y: 0, width: 1200, height: 1800 },
        placements: [placement],
        overlays: [
          { label: 'Logo', x: 120, y: 240, width: 240, height: 160, rotation: 15, zIndex: 10 },
        ],
      }),
    ).not.toThrow();
  });

  it('round-trips an exported archive back into importable entries', async () => {
    const manifest = {
      version: 1,
      templates: [
        {
          id: 'formatted-template-id',
          name: 'Roundtrip',
          orientation: 'portrait',
          width: 1200,
          height: 1800,
          active: true,
          requiredCaptureCount: 1,
          backgroundPath: 'assets/formatted-template-id/background.png',
          sortOrder: null,
          background: { x: 0, y: 0, width: 1200, height: 1800 },
          placements: [{ captureIndex: 1, x: 80, y: 120, width: 1040, height: 420, rotation: 0, borderRadius: 0, zIndex: 1 }],
          overlays: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              label: 'logo',
              path: 'assets/formatted-template-id/overlay-22222222-2222-4222-8222-222222222222.svg',
              x: 10,
              y: 10,
              width: 240,
              height: 160,
              rotation: 0,
              zIndex: 2,
            },
          ],
        },
      ],
    };
    async function* entries() {
      yield { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest)) };
      yield { name: 'assets/formatted-template-id/background.png', content: Buffer.from([1]) };
      yield {
        name: 'assets/formatted-template-id/overlay-22222222-2222-4222-8222-222222222222.svg',
        content: Buffer.from('<svg />'),
      };
    }
    const parts: Buffer[] = [];
    for await (const part of zip(entries())) parts.push(part);

    const pkg = parseManifest(parseZip(Buffer.concat(parts)));
    expect(pkg.templates).toHaveLength(1);
    expect(pkg.templates[0].template.name).toBe('Roundtrip');
    expect(pkg.templates[0].backgroundPath).toContain('background.png');
    expect(pkg.templates[0].overlays[0].path).toContain('.svg');
    expect(assetExtension('background.PNG')).toBe('png');
  });

  it('rejects an archive that references a missing asset', async () => {
    const manifest = {
      version: 1,
      templates: [
        {
          id: 'formatted-template-id',
          name: 'Crash',
          orientation: 'portrait',
          backgroundPath: 'assets/formatted-template-id/background.png',
          background: { x: 0, y: 0, width: 1200, height: 1800 },
          placements: [placement],
          overlays: [],
        },
      ],
    };
    async function* entries() {
      yield { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest)) };
    }
    const parts: Buffer[] = [];
    for await (const part of zip(entries())) parts.push(part);

    expect(() => parseManifest(parseZip(Buffer.concat(parts)))).toThrow(/missing asset/i);
  });

  it('preserves flipbook type and infers flipbook from coverPath or defaultType', async () => {
    const manifest = {
      version: 1,
      templates: [
        {
          name: 'Flipbook Frame 1',
          type: 'flipbook',
          orientation: 'portrait',
          coverPath: 'assets/fb-1/cover.png',
          background: { x: 0, y: 0, width: 1200, height: 1800 },
          placements: [placement],
          overlays: [],
        },
        {
          name: 'Implicit Flipbook Frame 2',
          orientation: 'portrait',
          coverPath: 'assets/fb-2/cover.png',
          background: { x: 0, y: 0, width: 1200, height: 1800 },
          placements: [placement],
          overlays: [],
        },
      ],
    };
    async function* entries() {
      yield { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest)) };
      yield { name: 'assets/fb-1/cover.png', content: Buffer.from([1]) };
      yield { name: 'assets/fb-2/cover.png', content: Buffer.from([2]) };
    }
    const parts: Buffer[] = [];
    for await (const part of zip(entries())) parts.push(part);

    const pkg = parseManifest(parseZip(Buffer.concat(parts)), 'flipbook');
    expect(pkg.templates[0].template.type).toBe('flipbook');
    expect(pkg.templates[1].template.type).toBe('flipbook');
  });
});
