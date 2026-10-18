import { getSqlite } from '../database/db';
import { sweepSessions, sweepTickets } from '../auth/sessions';
import { createModuleLogger } from '../logging';

const log = createModuleLogger('Maintenance');

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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
  private readonly running = new Set<string>();

  constructor(private readonly jobs: readonly MaintenanceJob[]) {}

  start(): void {
    if (this.timers.length > 0) return;
    for (const job of this.jobs) {
      const timer = setInterval(() => void this.execute(job), job.intervalMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  private async execute(job: MaintenanceJob): Promise<void> {
    if (this.running.has(job.name)) return;
    this.running.add(job.name);
    try {
      const result = await job.run();
      log.debug(`Job ${job.name} finished`, { result });
    } catch (err: unknown) {
      log.error(`Job ${job.name} failed`, { err });
    } finally {
      this.running.delete(job.name);
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
