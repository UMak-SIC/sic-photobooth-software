import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { printerConfig, type PrinterConfig } from '../config.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PrintJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export type CupsJobState =
  'pending' | 'processing' | 'stopped' | 'completed' | 'failed' | 'canceled';

const ippStateMap: Record<number, CupsJobState> = {
  3: 'pending',
  4: 'pending',
  5: 'processing',
  6: 'stopped',
  7: 'canceled',
  8: 'failed',
  9: 'completed',
};

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    typeof value[0] !== 'object' ||
    value[0] === null
  )
    return undefined;
  const nested = value[0] as Record<string, unknown>;
  return typeof nested['#text'] === 'string' || typeof nested['#text'] === 'number'
    ? String(nested['#text'])
    : undefined;
}

function collectIppJobs(node: unknown, jobs: Array<{ id: string; state: CupsJobState }>): void {
  if (Array.isArray(node)) {
    const attributes = new Map<string, string>();
    for (let index = 0; index < node.length - 1; index += 1) {
      const entry = node[index];
      if (typeof entry !== 'object' || entry === null || !('key' in entry)) continue;
      const key = textValue((entry as Record<string, unknown>).key);
      const valueEntry = node[index + 1];
      if (!key || typeof valueEntry !== 'object' || valueEntry === null) continue;
      const [value] = Object.values(valueEntry as Record<string, unknown>);
      const parsed = textValue(value);
      if (parsed) attributes.set(key, parsed);
    }
    const id = attributes.get('job-id');
    const state = Number(attributes.get('job-state'));
    if (id && ippStateMap[state]) jobs.push({ id, state: ippStateMap[state] });
    for (const child of node) collectIppJobs(child, jobs);
    return;
  }
  if (typeof node === 'object' && node !== null) {
    for (const child of Object.values(node as Record<string, unknown>)) collectIppJobs(child, jobs);
  }
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
    title?: string,
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
      '-t',
      title || `sic-print:${Date.now()}`,
      '-n',
      String(safeCopies),
      '-o',
      `media=${this.config.mediaSize}`,
      '-o',
      `MediaType=${this.config.printQuality}`,
    ];

    if (this.config.fitToPage) {
      args.push('-o', 'fit-to-page');
    }

    args.push(filePath);

    try {
      const { stdout } = await execFileAsync('/usr/bin/lp', args, {
        env: { ...process.env, LANG: 'C' },
        timeout: 15_000,
        maxBuffer: 64 * 1024,
      });
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

  public async getJobState(jobId: string): Promise<CupsJobState | null> {
    if (!this.config.enableHardwarePrint) return 'completed';
    try {
      const printerUri = `ipp://${this.config.cupsServer}/printers/${encodeURIComponent(this.config.printerName)}`;
      const requestFile = path.join(__dirname, 'ipp', 'get-jobs.test');
      const { stdout } = await execFileAsync(
        '/usr/bin/ipptool',
        ['-X', '-d', `PRINTER_URI=${printerUri}`, printerUri, requestFile],
        {
          env: { ...process.env, LANG: 'C' },
          timeout: 10_000,
          maxBuffer: 64 * 1024,
        },
      );
      const parsed = new XMLParser({ preserveOrder: true }).parse(stdout);
      const jobs: Array<{ id: string; state: CupsJobState }> = [];
      collectIppJobs(parsed, jobs);
      const numericJobId = jobId.match(/-(\d+)$/)?.[1] ?? jobId;
      return jobs.find((job) => job.id === numericJobId)?.state ?? null;
    } catch {
      return null;
    }
  }

  public async cancelJob(jobId: string): Promise<void> {
    if (!this.config.enableHardwarePrint) return;
    try {
      await execFileAsync('/usr/bin/cancel', [jobId], {
        env: { ...process.env, LANG: 'C' },
        timeout: 10_000,
        maxBuffer: 64 * 1024,
      });
    } catch {
      // The queue state is still canceled locally; a completed physical sheet requires operator attention.
    }
  }
}

export const printerService = new PrinterService();
