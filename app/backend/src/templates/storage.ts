import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const extensions = new Set(['png', 'jpg', 'svg']);

export class TemplateStorage {
  private readonly baseDir = path.resolve(config.storageDir, 'templates');

  private templateDir(templateId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) throw new Error('Invalid template identifier');
    return path.join(this.baseDir, templateId);
  }

  public async saveAsset(
    templateId: string,
    kind: 'background' | 'overlay',
    ext: string,
    buffer: Buffer,
  ): Promise<string> {
    const cleanExt = ext.toLowerCase().replace(/^\./, '');
    if (!extensions.has(cleanExt)) throw new Error('Unsupported image extension');
    const dir = this.templateDir(templateId);
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${kind}${kind === 'overlay' ? `_${randomUUID()}` : ''}.${cleanExt}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  public async removeAsset(filePath: string | null | undefined): Promise<void> {
    if (!filePath) return;
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(`${this.baseDir}${path.sep}`))
      throw new Error('Invalid template asset path');
    await fs.promises.rm(resolved, { force: true });
  }

  public async readAsset(templateId: string, filePath: string): Promise<Buffer> {
    const resolved = path.resolve(filePath);
    const templateDir = this.templateDir(templateId);
    if (!resolved.startsWith(`${templateDir}${path.sep}`))
      throw new Error('Invalid template asset path');
    return fs.promises.readFile(resolved);
  }

  public async removeTemplate(templateId: string): Promise<void> {
    await fs.promises.rm(this.templateDir(templateId), { recursive: true, force: true });
  }
}

export const templateStorage = new TemplateStorage();
