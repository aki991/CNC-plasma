import { db, read } from '../data/db';
import type { Job } from '../data/types';
import { atLocal, daysBetween, localDay, shiftMonth } from './calendar';
import { MachineHistoryService } from './history';
import { act, advanceSimulator, createSimulator, SimulatedMachineAdapter, type SimulatorAction, type SimulatorState } from './simulator';
import type { DowntimeReason, MachineId, OrderCompletion } from './types';

export const historyService = new MachineHistoryService();
export const readSession = () => db.machineSessions.orderBy('day').last();
export const readArchive = () => db.machineDays.toArray();
export async function readJobRuns(jobId: string) {
  const [session, archive] = await Promise.all([readSession(),db.machineDays.where('source').equals('session').toArray()]);
  return [...archive.flatMap(day=>day.runs),...(session?.runs??[])].filter(run=>run.jobId===jobId&&run.outcome==='completed');
}
const eligible = ['idle','paused','alarm','offline'];

function initialLinks(jobs: Job[]) {
  const valid = (id: string, index: number) => jobs.find(job => job.id === id)?.id ?? jobs.filter(job=>job.status!=='Završeno')[index]?.id ?? null;
  return { 'plasma-01':[valid('P-1058',0),valid('P-1055',2)], 'plasma-02':[valid('P-1068',1),valid('P-1056',3)] } satisfies SimulatorState['links'];
}

export function linkedOrderCompletions(session: SimulatorState, jobs: Job[]): OrderCompletion[] {
  return jobs.flatMap(job => {
    if (job.status !== 'Završeno' || !job.completedAt || job.completedAt !== session.day) return [];
    const run = session.runs.filter(item => item.jobId === job.id && item.outcome === 'completed').at(-1);
    return run ? [{id:job.id,machineId:run.machineId,timestamp:Math.max(run.end,atLocal(job.completedAt))}] : [];
  });
}

export class MachineTelemetryService {
  private timer?: ReturnType<typeof setInterval>;
  private startedDay?: string;
  async start(jobs: Job[]) {
    const wall = Date.now();
    const today = localDay(wall);
    if (this.timer && this.startedDay === today) return;
    await db.transaction('rw',db.machineSessions,db.machineDays,async () => {
      const previous = await readSession();
      if (previous && previous.day !== today) {
        await db.machineDays.put(historyService.currentDay(previous,linkedOrderCompletions(previous,jobs)));
        await db.machineSessions.delete(previous.day);
      }
      if (!previous || previous.day !== today) await db.machineSessions.put(createSimulator(today,wall,initialLinks(jobs)));
      else {
        advanceSimulator(previous,wall);
        await db.machineSessions.put(previous);
      }
      const existing = new Set(await db.machineDays.toCollection().primaryKeys());
      const missing = daysBetween(shiftMonth(today,-12),today).filter(day=>!existing.has(day));
      if (missing.length) await db.machineDays.bulkPut(missing.map(day=>historyService.historicalDay(day)));
    });
    this.startedDay = today;
    this.timer ??= setInterval(() => {
      void this.update(state => {
        if (!state.enabled) return;
        advanceSimulator(state,Date.now());
        return state;
      }).catch(error => {
        clearInterval(this.timer);
        this.timer = undefined;
        console.error('Čuvanje simulacije nije uspelo.',error);
      });
    },1000);
  }

  adapter(state: SimulatorState) { return new SimulatedMachineAdapter(() => state); }

  private update(change: (state: SimulatorState) => SimulatorState | void) {
    return db.transaction('rw',db.machineSessions,db.machineDays,async () => {
      const state = await readSession();
      if (!state) return;
      const next = change(state);
      if (!next) return;
      if (next.day !== state.day) {
        await db.machineDays.put(historyService.currentDay(state));
        await db.machineSessions.delete(state.day);
      }
      await db.machineSessions.put(next);
    });
  }
  command(action: SimulatorAction, id?: MachineId) {
    return this.update(state => act(state,action,Date.now(),id));
  }
  assign(id: MachineId, index: 0|1, jobId: string|null) {
    return db.transaction('rw',db.machineSessions,db.workshop,async () => {
      const session = await readSession();
      if (!session) return;
      const jobs = (await read())?.jobs;
      if (jobId && !jobs?.some(job=>job.id===jobId)) throw new Error('Radni nalog nije dostupan.');
      session.links[id][index] = jobId;
      await db.machineSessions.put(session);
    });
  }
  note(eventId: string, note: DowntimeReason, archiveDay?: string) {
    if (archiveDay) {
      return db.transaction('rw',db.machineDays,async () => {
        const day = await db.machineDays.get(archiveDay);
        if (!day?.events.some(event=>event.id===eventId&&eligible.includes(event.state))) throw new Error('Događaj nije dostupan.');
        await db.machineDays.put(historyService.withReason(day,eventId,note));
      });
    }
    return this.update(state => {
      const event = state.events.find(item=>item.id===eventId) ?? state.lanes.find(lane=>lane.event.id===eventId)?.event;
      if (!event || !eligible.includes(event.state)) throw new Error('Događaj nije dostupan.');
      return {...state,reasons:{...state.reasons,[eventId]:note}};
    });
  }
  confirm(runId: string, user: string) {
    return this.update(state => {
      if (!state.runs.some(run=>run.id===runId&&run.outcome==='completed') || state.confirmations.some(item=>item.runId===runId)) return;
      state.confirmations.push({runId,by:user,at:new Date().toISOString()});
      return state;
    });
  }
}
export const telemetryService = new MachineTelemetryService();
