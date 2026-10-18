import { getSqlite } from '../database/db';
import { sweepSessions, sweepTickets } from '../auth/sessions';
import { createModuleLogger } from '../logging';

const log = createModuleLogger('Maintenance');

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const STOP_TIMEOUT_MS = 5000;

export interface MaintenanceJob {
  name: string;
  intervalMs: number;
  run: () => unknown | Promise<unknown>;
}

/**
 * Runs housekeeping jobs on unref'd timers so they never keep the process
 * alive. A job that is still running is not started again, and a failing job
 * is logged without affecting the others.
 */
export class MaintenanceScheduler {
  private timers: NodeJS.Timeout[] = [];
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly jobs: readonly MaintenanceJob[]) {}

  start(): void {
    if (this.timers.length > 0) return;
    for (const job of this.jobs) {
      const timer = setInterval(() => void this.execute(job), job.intervalMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  /** Stops scheduling and waits for running jobs, at most `timeoutMs`. */
  async stop(timeoutMs = STOP_TIMEOUT_MS): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    if (this.running.size === 0) return;
    let timeout: NodeJS.Timeout | undefined;
    const expired = new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.running.values()]), expired]);
    clearTimeout(timeout);
  }

  private execute(job: MaintenanceJob): Promise<void> {
    if (this.running.has(job.name)) return Promise.resolve();
    const run = this.runJob(job).finally(() => this.running.delete(job.name));
    this.running.set(job.name, run);
    return run;
  }

  private async runJob(job: MaintenanceJob): Promise<void> {
    try {
      const result = await job.run();
      log.debug(`Job ${job.name} finished`, { result });
    } catch (err: unknown) {
      log.error(`Job ${job.name} failed`, { err });
    }
  }
}

export interface ModuleMaintenance {
  pruneSales: () => unknown | Promise<unknown>;
  sweepUploads: () => unknown | Promise<unknown>;
}

export const createDefaultMaintenanceJobs = (modules: ModuleMaintenance): MaintenanceJob[] => [
  { name: 'ticket-sweep', intervalMs: 5 * MINUTE_MS, run: () => sweepTickets() },
  { name: 'session-sweep', intervalMs: HOUR_MS, run: () => sweepSessions() },
  {
    name: 'sales-retention',
    intervalMs: DAY_MS,
    run: modules.pruneSales,
  },
  { name: 'orphan-uploads', intervalMs: DAY_MS, run: modules.sweepUploads },
  { name: 'sqlite-optimize', intervalMs: 6 * HOUR_MS, run: () => getSqlite().pragma('optimize') },
  {
    name: 'wal-checkpoint',
    intervalMs: 10 * MINUTE_MS,
    run: () => getSqlite().pragma('wal_checkpoint(PASSIVE)'),
  },
];
