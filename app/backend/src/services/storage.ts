import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type StorageCategory = 'originals' | 'videos' | 'intermediate' | 'outputs';

export class StorageService {
  private baseDir: string;

  constructor(baseDir: string = config.storageDir) {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * Initializes the root storage directory structure.
   */
  public initStorage(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    const publicOutputsDir = path.join(this.baseDir, 'outputs');
    if (!fs.existsSync(publicOutputsDir)) {
      fs.mkdirSync(publicOutputsDir, { recursive: true });
    }
  }

  /**
   * Sanitizes identifiers to prevent path traversal.
   */
  public sanitizeId(id: string): string {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid identifier');
    }
    // Allow alphanumeric characters, dashes, and underscores only
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitized || sanitized !== id) {
      throw new Error(`Path traversal or invalid identifier detected: "${id}"`);
    }
    return sanitized;
  }

  /**
   * Returns and creates the absolute path for a session category directory.
   */
  public getSessionDir(sessionId: string, category?: StorageCategory): string {
    const cleanSessionId = this.sanitizeId(sessionId);
    const sessionDir = path.join(this.baseDir, 'sessions', cleanSessionId);

    const targetDir = category ? path.join(sessionDir, category) : sessionDir;

    // Safety guard: ensure target directory resides within baseDir
    if (!targetDir.startsWith(this.baseDir)) {
      throw new Error('Path traversal violation');
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    return targetDir;
  }

  /**
   * Saves an original photo capture to disk.
   */
  public async saveOriginalCapture(
    sessionId: string,
    captureIndex: number,
    buffer: Buffer,
    ext: string = 'png',
  ): Promise<string> {
    const dir = this.getSessionDir(sessionId, 'originals');
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    const filename = `capture_${captureIndex}.${cleanExt}`;
    const filePath = path.join(dir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Saves a Flipbook video recording to disk.
   */
  public async saveVideo(
    sessionId: string,
    videoIndex: number,
    buffer: Buffer,
    ext: string = 'mp4',
  ): Promise<string> {
    const dir = this.getSessionDir(sessionId, 'videos');
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    const filename = `video_${videoIndex}.${cleanExt}`;
    const filePath = path.join(dir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Saves a final generated output (Photo Strip PNG or Flipbook GIF) by public ID.
   */
  public async saveOutput(
    sessionId: string,
    publicId: string,
    buffer: Buffer,
    ext: string = 'png',
  ): Promise<{ sessionFilePath: string; publicFilePath: string }> {
    const cleanPublicId = this.sanitizeId(publicId);
    const sessionDir = this.getSessionDir(sessionId, 'outputs');
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    const filename = `${cleanPublicId}.${cleanExt}`;

    const sessionFilePath = path.join(sessionDir, filename);
    await fs.promises.writeFile(sessionFilePath, buffer);

    // Also mirror to global outputs directory for fast publicId lookup
    const globalOutputsDir = path.join(this.baseDir, 'outputs');
    if (!fs.existsSync(globalOutputsDir)) {
      fs.mkdirSync(globalOutputsDir, { recursive: true });
    }
    const publicFilePath = path.join(globalOutputsDir, filename);
    await fs.promises.copyFile(sessionFilePath, publicFilePath);

    return { sessionFilePath, publicFilePath };
  }

  /**
   * Mirrors a session output file to the global outputs directory for fast publicId retrieval.
   */
  public async mirrorToGlobalOutputs(
    sessionFilePath: string,
    publicId: string,
    ext: string = 'gif',
  ): Promise<string> {
    const cleanPublicId = this.sanitizeId(publicId);
    const globalOutputsDir = path.join(this.baseDir, 'outputs');
    if (!fs.existsSync(globalOutputsDir)) {
      fs.mkdirSync(globalOutputsDir, { recursive: true });
    }
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    const publicFilePath = path.join(globalOutputsDir, `${cleanPublicId}.${cleanExt}`);
    await fs.promises.copyFile(sessionFilePath, publicFilePath);
    return publicFilePath;
  }

  /**
   * Returns the file path of a generated public output by public ID if it exists.
   */
  public getOutputPath(publicId: string, ext: 'png' | 'gif' = 'png'): string | null {
    const cleanPublicId = this.sanitizeId(publicId);
    const candidatePath = path.join(this.baseDir, 'outputs', `${cleanPublicId}.${ext}`);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
    return null;
  }

  public async removeOutput(publicId: string, filePath: string, mediaType: string): Promise<void> {
    await fs.promises.rm(filePath, { force: true });
    const extension = mediaType === 'image/gif' ? 'gif' : 'png';
    await fs.promises.rm(path.join(this.baseDir, 'outputs', `${this.sanitizeId(publicId)}.${extension}`), {
      force: true,
    });
  }

  /**
   * Deletes session storage assets.
   */
  public async cleanupSession(sessionId: string): Promise<void> {
    const dir = this.getSessionDir(sessionId);
    if (fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
}

export const storageService = new StorageService();
