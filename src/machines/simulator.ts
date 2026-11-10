import { atLocal, localDay } from './calendar';
import { machines, type ActivityState, type Alarm, type DowntimeReason, type JobLinks, type MachineAdapter, type MachineId, type MachineTelemetry, type OperatorConfirmation, type ProgramRun, type StatusEvent } from './types';

const programs = {
  'plasma-01': ['OGRADA_PETROVIC_TABLA_01.nc', 'OGRADA_PETROVIC_TABLA_02.nc'],
  'plasma-02': ['PANELI_JOVANOVIC_02.ngc', 'PANELI_JOVANOVIC_03.ngc'],
} satisfies Record<MachineId, string[]>;
type Phase = { state: ActivityState; seconds: number; alarm?: Alarm; reason?: string };
const phases: Record<MachineId, Phase[]> = {
  'plasma-01': [{state:'setup',seconds:90}, {state:'cutting',seconds:510}, {state:'paused',seconds:80,reason:'Zamena potrošnih delova'}, {state:'cutting',seconds:930}],
  'plasma-02': [{state:'setup',seconds:120}, {state:'cutting',seconds:600}, {state:'alarm',seconds:110,alarm:{code:'SIM-02',description:'Nestabilan luk pri probijanju'},reason:'Podešavanje mašine'}, {state:'cutting',seconds:1080}],
};
const isWork = (state: ActivityState) => state === 'setup' || state === 'cutting';
type Lane = {
  id: MachineId; event: Omit<StatusEvent,'end'>; run: ProgramRun | null; lastRun: ProgramRun | null;
  phase: number; remaining: number | null; sequence: number; eventSerial: number; override: 'alarm' | 'offline' | null;
};
export type SimulatorState = {
  id: string; day: string; now: number; wallAt: number; enabled: boolean; speed: 1 | 5 | 20;
  lanes: Lane[]; events: StatusEvent[]; runs: ProgramRun[]; links: JobLinks;
  reasons: Record<string, DowntimeReason>; confirmations: OperatorConfirmation[];
};
const SHIFT_END = 16;
const nextId = (id: MachineId, at: number, state: string) => id + '/' + at + '/' + state;

function changeEvent(state: SimulatorState, lane: Lane, at: number, activity: ActivityState, alarm?: Alarm, simulatedReason?: string) {
  if (at > lane.event.start || lane.event.alarm || lane.event.state==='offline' || state.reasons[lane.event.id])
    state.events.push({ ...lane.event, end: at });
  lane.eventSerial = (lane.eventSerial ?? 0) + 1;
  lane.event = {
    id: state.id + '/' + nextId(lane.id, at, activity) + '/' + lane.eventSerial, machineId: lane.id, start: at, state: activity,
    program: lane.run?.program ?? null, jobId: lane.run?.jobId ?? null, alarm, simulatedReason,
  };
}
function applyPhase(state: SimulatorState, lane: Lane, at: number) {
  const phase = phases[lane.id][lane.phase];
  changeEvent(state, lane, at, phase.state, phase.alarm, phase.reason);
}
function startRun(state: SimulatorState, lane: Lane, at: number) {
  const index = lane.sequence % 2;
  lane.run = {
    id: state.id + '/' + nextId(lane.id,at,'run'), machineId: lane.id, start: at, end: at,
    program: programs[lane.id][index], jobId: state.links[lane.id][index],
    plannedSeconds: phases[lane.id].filter(phase => isWork(phase.state)).reduce((sum, phase) => sum + phase.seconds, 0),
    workSeconds: 0, cutSeconds: 0, outcome: 'completed',
  };
  lane.phase = 0;
  lane.remaining = phases[lane.id][0].seconds;
  applyPhase(state, lane, at);
}
function completeRun(state: SimulatorState, lane: Lane, at: number) {
  if (!lane.run) return;
  lane.lastRun = { ...lane.run, end: at };
  state.runs.push(lane.lastRun);
  lane.run = null;
  lane.sequence++;
  lane.remaining = lane.sequence < programs[lane.id].length ? 180 : null;
  changeEvent(state, lane, at, 'idle');
}
function advanceLane(state: SimulatorState, lane: Lane, end: number) {
  let cursor = state.now;
  while (!lane.override && cursor < end) {
    const seconds = Math.min((end - cursor) / 1000, lane.remaining ?? Infinity);
    if (lane.run && isWork(lane.event.state)) {
      lane.run.workSeconds += seconds;
      if (lane.event.state === 'cutting') lane.run.cutSeconds += seconds;
    }
    cursor += seconds * 1000;
    if (lane.remaining === null) break;
    lane.remaining -= seconds;
    if (lane.remaining > 0) break;
    if (!lane.run) startRun(state, lane, cursor);
    else if (++lane.phase === phases[lane.id].length) completeRun(state, lane, cursor);
    else {
      lane.remaining = phases[lane.id][lane.phase].seconds;
      applyPhase(state, lane, cursor);
    }
  }
}
export function createSimulator(day: string, wallAt: number, links: JobLinks, inProgress = true): SimulatorState {
  const start = atLocal(day, 8);
  const state: SimulatorState = {
    id:'session-'+wallAt, day, now: start, wallAt, enabled: inProgress, speed: 5, links, events: [], runs: [], reasons: {}, confirmations: [],
    lanes: machines.map((machine,index) => ({
      id: machine.id, event: { id:'session-'+wallAt+'/'+nextId(machine.id,start,'idle'), machineId:machine.id, start, state:'idle', program:null, jobId:null },
      run:null, lastRun:null, phase:0, remaining:120 * index, sequence:0, eventSerial:0, override:null,
    })),
  };
  if (inProgress) advanceSimulator(state, wallAt + 60_000, 60_000);
  state.wallAt = wallAt;
  return state;
}
export function advanceSimulator(state: SimulatorState, wall: number, maxGap = 10_000) {
  const delta = wall - state.wallAt;
  if (delta <= 0) return;
  state.wallAt = wall;
  // On reload after a closed tab, continue from the saved simulated clock.
  if (!state.enabled || delta > maxGap) return;
  const stop = atLocal(state.day, SHIFT_END);
  const end = Math.min(stop, state.now + delta * state.speed);
  state.lanes.forEach(lane => advanceLane(state, lane, end));
  state.now = end;
  if (end === stop) state.enabled = false;
}

export type SimulatorAction = 'start' | 'pause' | 'resume' | 'normal' | 'fast' | 'turbo' | 'alarm' | 'clear' | 'disconnect' | 'reconnect' | 'finish' | 'reset';
export function act(state: SimulatorState, action: SimulatorAction, wall: number, machineId?: MachineId): SimulatorState {
  advanceSimulator(state, wall);
  const lane = state.lanes.find(item => item.id === machineId);
  if (action === 'reset') return createSimulator(localDay(wall), wall, state.links, false);
  if (action === 'pause') state.enabled = false;
  if (action === 'start' || action === 'resume') {
    if (state.now >= atLocal(state.day,SHIFT_END)) throw new Error('Za novu smenu resetujte simulaciju.');
    state.enabled = true;
    if (action === 'start') {
      for (const item of state.lanes) {
        if (!item.run && !item.override && item.sequence === 0) startRun(state,item,state.now);
      }
    }
  }
  if (action === 'normal' || action === 'fast' || action === 'turbo') state.speed = {normal:1,fast:5,turbo:20}[action] as SimulatorState['speed'];
  if (!lane) return state;
  if (action === 'alarm' && !lane.override && lane.event.state !== 'alarm') {
    lane.override = 'alarm';
    changeEvent(state,lane,state.now,'alarm',{code:'SIM-01',description:'Nizak pritisak gasa'});
  }
  if (action === 'disconnect' && lane.override !== 'offline') {
    lane.override = 'offline';
    changeEvent(state,lane,state.now,'offline',undefined,'Prekid veze sa kontrolerom');
  }
  if ((action === 'reconnect' && lane.override === 'offline') || (action === 'clear' && lane.event.state === 'alarm')) {
    const scriptedAlarm = lane.run && phases[lane.id][lane.phase].state === 'alarm';
    lane.override = null;
    if (lane.run) {
      if (action === 'clear' && scriptedAlarm) {
        lane.phase++;
        lane.remaining = phases[lane.id][lane.phase].seconds;
      }
      applyPhase(state,lane,state.now);
    } else changeEvent(state,lane,state.now,'idle');
  }
  if (action === 'finish' && lane.run && !lane.override && lane.event.state !== 'alarm') completeRun(state,lane,state.now);
  return state;
}

export class SimulatedMachineAdapter implements MachineAdapter {
  constructor(private readonly getState: () => SimulatorState) {}
  async readTelemetry(): Promise<MachineTelemetry[]> { return this.sample(); }
  sample(): MachineTelemetry[] {
    const state = this.getState();
    return state.lanes.map(lane => {
      const online = lane.event.state !== 'offline';
      const run = lane.run ?? lane.lastRun;
      const complete = !lane.run && !!lane.lastRun;
      const elapsed = run ? Math.floor(run.workSeconds) : null;
      const status = lane.event.state === 'alarm' || lane.event.state === 'paused' ? lane.event.state
        : complete ? 'completed' : isWork(lane.event.state) ? 'running' : 'idle';
      return {
        machineId:lane.id, timestamp:new Date(state.now).toISOString(), connectionState:online?'online':'offline', operatingState:online?status:'unknown',
        programName:online?(run?.program??null):null, jobId:online?(run?.jobId??null):null,
        programProgressPercent:online && run ? complete?100:Math.min(99,Math.floor(run.workSeconds/run.plannedSeconds*100)) : null,
        elapsedSeconds:online?elapsed:null, estimatedRemainingSeconds:online && run ? complete?0:run.plannedSeconds-elapsed! : null,
        controllerAlarmCode:lane.event.alarm?.code??null, source:'simulator',
      };
    });
  }
}
