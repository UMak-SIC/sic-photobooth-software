import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { printerConfig, type PrinterConfig } from '../config.js';
import { XMLParser } from 'fast-xml-parser';

const execFileAsync = promisify(execFile);

export interface PrintJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export type CupsJobState = 'pending' | 'processing' | 'stopped' | 'completed' | 'failed' | 'canceled';
export interface CupsJob { id: string; state: CupsJobState; reason?: string }

export class PrinterService {
  private config: PrinterConfig;

  constructor(customConfig?: Partial<PrinterConfig>) {
    this.config = { ...printerConfig, ...customConfig };
  }

  /**
   * Prints an image file directly to CUPS via the lp command line tool.
   */
  public async submit(
    filePath: string,
    copies: number,
    title: string,
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
        jobId: `simulation-${title}`,
      };
    }

    const safeCopies = Math.max(1, Math.min(copies, 10));
    const args: string[] = [
      '-d',
      this.config.printerName,
      '-n',
      String(safeCopies),
      '-t',
      title,
      '-o',
      `media=${this.config.mediaSize}`,
    ];

    if (this.config.fitToPage) {
      args.push('-o', 'fit-to-page');
    }

    args.push(filePath);

    try {
      const { stdout } = await execFileAsync('/usr/bin/lp', args, { timeout: 15000, env: { ...process.env, LANG: 'C' } });
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

  public async printImage(filePath: string, copies = 1): Promise<PrintJobResult> {
    return this.submit(filePath, copies, `sic-print:legacy:${Date.now()}:1`);
  }

  public async getJob(cupsJobId: string): Promise<CupsJob | null> {
    if (!this.config.enableHardwarePrint) return { id: cupsJobId, state: 'completed' };
    const uri = `ipp://${this.config.cupsServer}/printers/${encodeURIComponent(this.config.printerName)}`;
    try {
      const { stdout } = await execFileAsync('/usr/bin/ipptool', ['-X', '-tv', uri, '/usr/share/cups/ipptool/get-jobs.test'], { timeout: 15000, env: { ...process.env, LANG: 'C' } });
      const parsed = new XMLParser({ ignoreAttributes: false }).parse(stdout);
      const text = JSON.stringify(parsed);
      if (!text.includes(cupsJobId)) return null;
      const state = /job-state[^\d]*(\d+)/.exec(text)?.[1];
      const mapped: Record<string, CupsJobState> = { '3': 'pending', '4': 'pending', '5': 'processing', '6': 'stopped', '7': 'canceled', '8': 'failed', '9': 'completed' };
      return { id: cupsJobId, state: mapped[state || ''] || 'failed' };
    } catch {
      return null;
    }
  }
}

export const printerService = new PrinterService();
