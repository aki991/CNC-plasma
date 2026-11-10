import Dexie, { type Table } from 'dexie';
import type { State } from './types';
import { packageSchema } from '../fence/fieldContract';
import type { DailyRecord } from '../machines/history';
import type { SimulatorState } from '../machines/simulator';

class Workshop extends Dexie {
  workshop!: Table<{ id: string; data: State }, string>;
  machineSessions!: Table<SimulatorState, string>;
  machineDays!: Table<DailyRecord, string>;
  constructor() {
    super('cnc-cut-pro');
    this.version(1).stores({ workshop: 'id' });
    this.version(2).stores({ machineSessions: 'day', machineDays: 'day,source' });
  }
}
export const db = new Workshop();
const key = 'local';
export async function initialize() {
  if (await db.workshop.get(key)) return;
  const data = await new Promise<State>((resolve, reject) => {
    const worker = new Worker(new URL('./seed.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<State>) => { worker.terminate(); resolve(data); };
    worker.onerror = () => { worker.terminate(); reject(new Error('Početni podaci nisu mogli da se pripreme.')); };
  });
  await db.transaction('rw', db.workshop, async () => {
    if (!(await db.workshop.get(key))) await db.workshop.add({ id: key, data });
  });
}
export const read = async () => (await db.workshop.get(key))?.data;
export async function update(change: (state: State) => void) {
  await db.transaction('rw', db.workshop, async () => {
    const row = await db.workshop.get(key);
    if (!row) throw new Error('Lokalna baza nije spremna.');
    change(row.data);
    await db.workshop.put(row);
  });
}
export async function restore(data: State) {
  const lists = ['jobs','customers','models','inventory','reservations','quotes','calculations','activities','machines','operators','prices'] as const;
  if (data?.version !== 1 || !lists.every(name => Array.isArray(data[name])) ||
      typeof data.settings?.company !== 'string' || !Number.isFinite(data.settings?.tolerance) ||
      data.jobs.some(job => !job.id || !Array.isArray(job.parts) || (job.nest && !Array.isArray(job.nest.sheets))) ||
      data.models.some(model => typeof model.raw !== 'string' || !Array.isArray(model.shape?.rings)) ||
      data.customers.some(customer => typeof customer.name !== 'string') ||
      data.inventory.some(stock => !Number.isFinite(stock.quantity)) ||
      (data.fenceProjects !== undefined && (!Array.isArray(data.fenceProjects) || data.fenceProjects.some(project =>
        !project?.id || !Number.isInteger(project.revision) || typeof project.design?.name !== 'string' ||
        !Array.isArray(project.design?.segments) || !Array.isArray(project.design.posts) ||
        (project.design.segments.length ? project.design.posts.length !== project.design.segments.length + 1 : project.design.posts.length > 1) ||
        project.design.segments.some(segment => !Array.isArray(segment?.panels) || segment.panels.length !== 2) ||
        (project.generated && !Array.isArray(project.generated.parts))))) ||
      (data.fieldImports !== undefined && (!Array.isArray(data.fieldImports) || data.fieldImports.some(row =>
        !row || typeof row.key !== 'string' || !packageSchema.safeParse(row.packet).success ||
        !Array.isArray(row.projects) || row.projects.some(p => typeof p?.id !== 'string' || !['fence', 'gate'].includes(p.kind))))) ||
      data.quotes.some(quote => !Array.isArray(quote.lines) || !quote.customer)) throw new Error('Rezervna kopija nije u podržanom formatu.');
  await db.workshop.put({ id: key, data });
}

