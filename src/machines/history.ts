import { atLocal, HOUR, secondsIn } from './calendar';
import type { SimulatorState } from './simulator';
import { machines, type DowntimeReason, type Interval, type MachineId, type OperatorConfirmation, type OrderCompletion, type ProgramRun, type Shift, type StatusEvent } from './types';

export type Totals = {
  planned: number; work: number; cutting: number; idle: number; paused: number; alarm: number; offline: number; blocked: number;
  programs: number; jobs: number; cycleSeconds: number;
};
export type DailyRecord = {
  day: string; source: 'archive' | 'session'; shifts: Shift[]; events: StatusEvent[]; runs: ProgramRun[];
  completions: OrderCompletion[]; totals: Record<MachineId, Totals>;
  reasons?: Record<string, DowntimeReason>; confirmations?: OperatorConfirmation[];
};
export const emptyTotals = (): Totals => ({
  planned:0, work:0, cutting:0, idle:0, paused:0, alarm:0, offline:0, blocked:0, programs:0, jobs:0, cycleSeconds:0,
});
export function addTotals(target: Totals, item: Totals) {
  for (const key of Object.keys(target) as (keyof Totals)[]) target[key] += item[key] ?? 0;
  return target;
}
export function summarize(record: Omit<DailyRecord,'totals'>, ids: readonly MachineId[], window: Interval): Totals {
  const totals = emptyTotals();
  const belongs = (entry: {machineId: MachineId}) => ids.includes(entry.machineId);
  for (const shift of record.shifts) if (belongs(shift)) totals.planned += secondsIn(shift,window);
  for (const event of record.events) if (belongs(event)) {
    const seconds = secondsIn(event,window);
    if (event.state === 'setup' || event.state === 'cutting') totals.work += seconds;
    if (event.state === 'idle' && (record.reasons?.[event.id] || event.simulatedReason)) totals.blocked += seconds;
    else if (event.state !== 'setup') totals[event.state] += seconds;
  }
  for (const run of record.runs) if (belongs(run) && run.outcome === 'completed' && run.end >= window.start && run.end < window.end) {
    totals.programs++;
    totals.cycleSeconds += (run.end-run.start)/1000;
  }
  totals.jobs = new Set(record.completions.filter(item=>belongs(item)&&item.timestamp>=window.start&&item.timestamp<window.end).map(item=>item.id)).size;
  return totals;
}
const fullWindow = {start:-Infinity,end:Infinity};
function aggregate(record: Omit<DailyRecord,'totals'>): DailyRecord {
  return { ...record, totals: { 'plasma-01':summarize(record,['plasma-01'],fullWindow), 'plasma-02':summarize(record,['plasma-02'],fullWindow) } };
}

function randomFor(day: string, index: number) {
  let seed = (Number(day.replaceAll('-','')) ^ (0x83adf1 + index * 10191)) >>> 0;
  return (min: number, max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(seed / 4294967296 * (max-min+1));
  };
}
export class MachineHistoryService {
  withReason(record: DailyRecord, eventId: string, reason: DowntimeReason) {
    return aggregate({...record,reasons:{...record.reasons,[eventId]:reason}});
  }
  historicalDay(day: string): DailyRecord {
    const record: Omit<DailyRecord,'totals'> = { day, source:'archive', shifts:[], events:[], runs:[], completions:[] };
    const weekday = new Date(day).getUTCDay();
    machines.forEach(({id},index) => {
      const pick = randomFor(day,index);
      if (weekday === 0 || (weekday === 6 && pick(1,8) !== 1)) return;
      const start = atLocal(day,8), end = atLocal(day,weekday === 6 ? 12 : pick(1,9) === 1 ? 17 : 16);
      record.shifts.push({machineId:id,name:'Prva smena',start,end});
      let cursor = start;
      let cycle = 0;
      let batch = 1;
      let left = pick(2,4);
      let lunch = false;
      const add = (state: StatusEvent['state'], seconds: number, program: string|null, orderId?: string, alarm?: StatusEvent['alarm'], simulatedReason?: string) => {
        const next = Math.min(end,cursor+seconds*1000);
        if (next > cursor) record.events.push({id:id+'/'+cursor+'/'+state,machineId:id,start:cursor,end:next,state,program,orderId,jobId:null,alarm,simulatedReason});
        const elapsed = (next-cursor)/1000;
        cursor = next;
        return elapsed;
      };
      add('idle',pick(4,18)*60,null);
      while (cursor < end) {
        if (!lunch && cursor >= start+3.5*HOUR) {
          add('idle',1800,null);
          lunch = true;
        }
        if (cursor >= end) break;
        const orderId = 'SIM-' + day.replaceAll('-','') + '-' + (index+1) + '-' + batch;
        const program = ['OGRADA','PANEL','NOSAC','KAPIJA'][(batch+index)%4] + '_TABLA_' + (++cycle) + (index ? '.ngc' : '.nc');
        const planned = pick(16,40)*60;
        const runStart = cursor;
        const setup = add('setup',pick(60,180),program,orderId);
        const actualCut = Math.round(planned*pick(82,118)/100)-setup;
        let cut = add('cutting',Math.floor(actualCut/2),program,orderId);
        const interruption = pick(1,12);
        if (interruption === 1) add('alarm',pick(180,960),program,orderId,{code:'SIM-02',description:'Nestabilan luk pri probijanju'},'Zamena potrošnih delova');
        if (interruption === 2) add('paused',pick(120,600),program,orderId,undefined,'Podešavanje mašine');
        if (interruption === 3) add('offline',pick(60,360),program,orderId,undefined,'Prekid veze sa kontrolerom');
        cut += add('cutting',Math.ceil(actualCut/2),program,orderId);
        const completed = cut === actualCut;
        record.runs.push({id:id+'/'+runStart+'/run',machineId:id,start:runStart,end:cursor,program,jobId:null,orderId,plannedSeconds:planned,
          workSeconds:setup+cut,cutSeconds:cut,outcome:completed?'completed':'cancelled'});
        if (completed && --left === 0) {
          record.completions.push({id:orderId,machineId:id,timestamp:cursor});
          batch++;
          left = pick(2,4);
        }
        if (pick(1,8) === 1) add('idle',pick(600,1200),null,undefined,undefined,'Čekanje materijala');
        add('idle',pick(180,540),null);
      }
    });
    return aggregate(record);
  }
  currentDay(state: SimulatorState, completions: OrderCompletion[] = []): DailyRecord {
    const start = atLocal(state.day,8);
    return aggregate({
      day:state.day,source:'session',shifts:machines.map(machine=>({machineId:machine.id,name:'Prva smena',start,end:state.now})),
      events:[...state.events,...state.lanes.map(lane=>({...lane.event,end:state.now}))],
      runs:state.runs,completions,reasons:state.reasons,confirmations:state.confirmations,
    });
  }
}
