import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { printerConfig, type PrinterConfig } from '../config.js';

const execFileAsync = promisify(execFile);

export interface PrintJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export class PrinterService {
  private config: PrinterConfig;

  constructor(customConfig?: Partial<PrinterConfig>) {
    this.config = { ...printerConfig, ...customConfig };
  }

  /**
   * Prints an image file directly to CUPS via the lp command line tool.
   */
  public async printImage(
    filePath: string,
    copies: number = 1,
  ): Promise<PrintJobResult> {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `Print file not found at path: ${filePath}`,
      };
    }

    // If hardware printing is disabled (e.g. CI / test runner / simulation)
    if (!this.config.enableHardwarePrint) {
      return {
        success: true,
        jobId: `mock-cups-job-${Date.now()}`,
      };
    }

    const safeCopies = Math.max(1, Math.min(copies, 10));
    const args: string[] = [
      '-d',
      this.config.printerName,
      '-n',
      String(safeCopies),
      '-o',
      `media=${this.config.mediaSize}`,
    ];

    if (this.config.fitToPage) {
      args.push('-o', 'fit-to-page');
    }

    args.push(filePath);

    try {
      const { stdout, stderr } = await execFileAsync('/usr/bin/lp', args);
      const match = stdout.match(/request id is ([^\s]+)/i);
      const jobId = match ? match[1] : undefined;

      return {
        success: true,
        jobId: jobId || 'queued',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }
}

export const printerService = new PrinterService();

