import { describe, expect, it } from 'vitest';
import { downtime, MachineAnalyticsService, utilization } from '../src/machines/analytics';
import { atLocal, dateInterval, HOUR, selectRange, shiftDay } from '../src/machines/calendar';
import { MachineHistoryService } from '../src/machines/history';
import { act, advanceSimulator, createSimulator, SimulatedMachineAdapter } from '../src/machines/simulator';
import type { JobLinks, MachineId, StatusEvent } from '../src/machines/types';

const day = '2026-11-10';
const links: JobLinks = {'plasma-01':['P-1058','P-1055'],'plasma-02':['P-1068','P-1056']};
const ids = ['plasma-01','plasma-02'] as const;
const history = new MachineHistoryService();
const sample = (state: ReturnType<typeof createSimulator>) => new SimulatedMachineAdapter(()=>state).sample();

function checkEvents(events: StatusEvent[]) {
  expect(new Set(events.map(event=>event.id)).size).toBe(events.length);
  for (const id of ids) {
    const lane = events.filter(event=>event.machineId===id).sort((a,b)=>a.start-b.start);
    lane.forEach((event,index)=>{
      expect(event.end).toBeGreaterThanOrEqual(event.start);
      if (index) expect(event.start).toBe(lane[index-1].end);
    });
  }
}

describe('Simulator CNC mašina',()=>{
  it('starts linked programs at zero, passes through a pause and alarm, and reaches 100%',()=>{
    const state = act(createSimulator(day,0,links,false),'start',0);
    expect(sample(state).map(item=>[item.jobId,item.programProgressPercent])).toEqual([['P-1058',0],['P-1068',0]]);
    advanceSimulator(state,125_000,Infinity);
    expect(sample(state)[0]).toMatchObject({operatingState:'paused',elapsedSeconds:600,estimatedRemainingSeconds:930});
    advanceSimulator(state,147_000,Infinity);
    expect(sample(state)[1]).toMatchObject({operatingState:'alarm',controllerAlarmCode:'SIM-02',elapsedSeconds:720});
    advanceSimulator(state,322_000,Infinity);
    expect(sample(state)[0]).toMatchObject({operatingState:'completed',programProgressPercent:100,estimatedRemainingSeconds:0});
    expect(state.runs[0]).toMatchObject({jobId:'P-1058',workSeconds:1530,cutSeconds:1440,outcome:'completed'});
    expect((state.runs[0].end-state.runs[0].start)/1000).toBe(1610);
    advanceSimulator(state,370_000,Infinity);
    expect(sample(state)[0]).toMatchObject({jobId:'P-1055',programName:'OGRADA_PETROVIC_TABLA_02.nc',operatingState:'running'});
    checkEvents(history.currentDay(state).events);
  });

  it('persists the clock, pauses, resumes and handles manual alarm, disconnect and finish without duplicate runs',()=>{
    const id: MachineId = 'plasma-01';
    const state = createSimulator(day,1000,links);
    act(state,'pause',2000);
    const saved = structuredClone(state);
    act(saved,'resume',50000);
    expect(saved.now).toBe(state.now);
    act(saved,'alarm',51000,id);
    expect(sample(saved)[0].operatingState).toBe('alarm');
    act(saved,'clear',52000,id);
    expect(sample(saved)[0].operatingState).toBe('running');
    act(saved,'disconnect',53000,id);
    expect(sample(saved)[0]).toMatchObject({connectionState:'offline',programProgressPercent:null,programName:null});
    act(saved,'reconnect',54000,id);
    expect(sample(saved)[0]).toMatchObject({connectionState:'online',jobId:'P-1058'});
    act(saved,'finish',55000,id);
    act(saved,'finish',55000,id);
    expect(saved.runs).toHaveLength(1);
    expect(sample(saved)[0].programProgressPercent).toBe(100);
    const report = history.currentDay(saved);
    expect(report.totals[id]).toMatchObject({planned:330,work:320,cutting:230,alarm:5,offline:5,programs:1,jobs:0});
    checkEvents(report.events);
  });

  it('preserves manually resolved alarms recorded at the same paused clock time',()=>{
    const id: MachineId = 'plasma-01';
    const state = createSimulator(day,1000,links);
    act(state,'pause',1000);
    act(state,'alarm',1000,id);
    act(state,'clear',1000,id);
    act(state,'alarm',1000,id);
    act(state,'clear',1000,id);
    const report = history.currentDay(state);
    expect(report.events.filter(event=>event.machineId===id&&event.state==='alarm')).toHaveLength(2);
    expect(report.totals[id].alarm).toBe(0);
    checkEvents(report.events);
  });
});

describe('Istorija i analitika CNC mašina',()=>{
  it('produces a deterministic business shift with complete non-overlapping coverage and independently counted jobs',()=>{
    const record = history.historicalDay(day);
    expect(history.historicalDay(day)).toEqual(record);
    expect(record.runs.length).toBeGreaterThan(0);
    checkEvents(record.events);
    expect(history.historicalDay('2026-11-08').events).toEqual([]);
    for (const id of ids) {
      const totals = record.totals[id];
      expect(totals.work + totals.idle + downtime(totals)).toBe(totals.planned);
      expect(utilization(totals)).toBe(totals.work/totals.planned*100);
      expect(totals.jobs).toBeLessThan(totals.programs);
      expect(totals.cutting).toBeLessThan(totals.work);
    }
  });

  it('rolls up hourly, daily and monthly buckets to the same totals over several date ranges',()=>{
    const records = new Map(Array.from({length:365},(_,index)=>shiftDay(day,-index)).map(date=>[date,history.historicalDay(date)]));
    const service = new MachineAnalyticsService(records);
    const custom = {from:shiftDay(day,-6),to:day};
    for (const [period,buckets] of [['today',24],['week',7],['month',10],['year',11]] as const) {
      const report = service.report(ids,selectRange(period,day,custom),period==='year');
      expect(report.buckets).toHaveLength(buckets);
      for (const key of ['planned','work','cutting','idle','alarm','paused','programs','jobs'] as const)
        expect(report.buckets.reduce((sum,bucket)=>sum+bucket.totals[key],0)).toBeCloseTo(report.total[key],5);
    }
  });

  it('uses 23 and 25 hourly buckets across Belgrade DST boundaries',()=>{
    for (const [date,expected] of [['2026-03-29',23],['2026-10-25',25]] as const) {
      const range = {from:date,to:date};
      const interval = dateInterval(range);
      expect((interval.end-interval.start)/HOUR).toBe(expected);
      expect(atLocal(date,8)).toBeGreaterThan(interval.start);
      const report = new MachineAnalyticsService(new Map()).report(ids,range);
      expect(report.buckets).toHaveLength(expected);
      expect(new Set(report.buckets.map(item=>item.label)).size).toBe(expected);
    }
  });

  it('moves annotated idle time into downtime without counting it twice',()=>{
    const record = history.historicalDay(day);
    const event = record.events.find(item=>item.state==='idle'&&!item.simulatedReason)!;
    const before = record.totals[event.machineId];
    const updated = history.withReason(record,event.id,{category:'Kvar',note:'Provera senzora',enteredBy:'Operater',enteredAt:'2026-11-10T07:20:00Z'});
    const after = updated.totals[event.machineId];
    const length = (event.end-event.start)/1000;
    expect(after.idle).toBe(before.idle-length);
    expect(downtime(after)).toBe(downtime(before)+length);
    expect(after.planned).toBe(before.planned);
    expect(updated.reasons?.[event.id]).toMatchObject({enteredBy:'Operater'});
  });
});
