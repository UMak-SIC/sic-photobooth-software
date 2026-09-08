import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const extensions = new Set(['png', 'jpg', 'svg']);

export class TemplateStorage {
  private readonly baseDir = path.resolve(config.storageDir);

  private templateDir(templateId: string, type: 'photo_strip' | 'flipbook' = 'photo_strip'): string {
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) throw new Error('Invalid template identifier');
    return path.join(this.baseDir, type === 'flipbook' ? 'flipbook' : 'templates', templateId);
  }

  private assetPath(filePath: string): string {
    const resolved = path.resolve(config.storageDir, filePath);
    const templateDir = path.join(this.baseDir, 'templates');
    const flipbookDir = path.join(this.baseDir, 'flipbook');
    if (!resolved.startsWith(`${templateDir}${path.sep}`) && !resolved.startsWith(`${flipbookDir}${path.sep}`))
      throw new Error('Invalid template asset path');
    return resolved;
  }

  public async saveAsset(
    templateId: string,
    kind: 'background' | 'overlay' | 'cover',
    ext: string,
    buffer: Buffer,
    type: 'photo_strip' | 'flipbook' = 'photo_strip',
  ): Promise<string> {
    const cleanExt = ext.toLowerCase().replace(/^\./, '');
    if (!extensions.has(cleanExt)) throw new Error('Unsupported image extension');
    const dir = this.templateDir(templateId, type);
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${kind}${kind === 'overlay' ? `_${randomUUID()}` : ''}.${cleanExt}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  public async removeAsset(filePath: string | null | undefined): Promise<void> {
    if (!filePath) return;
    await fs.promises.rm(this.assetPath(filePath), { force: true });
  }

  public async readAsset(templateId: string, filePath: string, type: 'photo_strip' | 'flipbook' = 'photo_strip'): Promise<Buffer> {
    const resolved = this.assetPath(filePath);
    const templateDir = this.templateDir(templateId, type);
    if (!resolved.startsWith(`${templateDir}${path.sep}`))
      throw new Error('Invalid template asset path');
    return fs.promises.readFile(resolved);
  }

  public async copyAsset(
    sourceTemplateId: string,
    sourcePath: string,
    targetTemplateId: string,
    kind: 'background' | 'overlay' | 'cover',
    sourceType: 'photo_strip' | 'flipbook' = 'photo_strip',
    targetType: 'photo_strip' | 'flipbook' = 'photo_strip',
  ): Promise<string> {
    const ext = path.extname(sourcePath).toLowerCase();
    return this.saveAsset(
      targetTemplateId,
      kind,
      ext,
      await this.readAsset(sourceTemplateId, sourcePath, sourceType),
      targetType,
    );
  }

  public async removeTemplate(templateId: string, type: 'photo_strip' | 'flipbook' = 'photo_strip'): Promise<void> {
    await fs.promises.rm(this.templateDir(templateId, type), { recursive: true, force: true });
  }
}

export const templateStorage = new TemplateStorage();
