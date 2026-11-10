import { atLocal, dateInterval, daysBetween, HOUR, localDay, shiftDay, shiftMonth, timeLabel, type DateRange } from './calendar';
import { addTotals, emptyTotals, summarize, type DailyRecord, type Totals } from './history';
import type { Interval, MachineId } from './types';

export const downtime = (totals: Totals) => totals.paused + totals.alarm + totals.offline + totals.blocked;
export const utilization = (totals: Totals) => totals.planned ? totals.work / totals.planned * 100 : null;
export const downtimePercent = (totals: Totals) => totals.planned ? downtime(totals) / totals.planned * 100 : null;
export type AnalyticsBucket = { label: string; totals: Totals };

export class MachineAnalyticsService {
  constructor(private readonly days: ReadonlyMap<string, DailyRecord>) {}
  private totals(ids: readonly MachineId[], from: string, to: string): Totals {
    return daysBetween(from,to).reduce((sum,day) => {
      const record = this.days.get(day);
      if (record) for (const id of ids) addTotals(sum,record.totals[id]);
      return sum;
    },emptyTotals());
  }
  summary(ids: readonly MachineId[], range: DateRange) {
    return this.totals(ids,range.from,shiftDay(range.to,1));
  }
  report(ids: readonly MachineId[], range: DateRange, monthly = false) {
    const end = shiftDay(range.to,1);
    const days = daysBetween(range.from,end);
    const total = this.summary(ids,range);
    const buckets: AnalyticsBucket[] = [];
    const add = (label: string, from: string, to: string) => buckets.push({ label,totals:this.totals(ids,from,to) });
    if (days.length === 1 && !monthly) {
      const day = this.days.get(range.from);
      const bounds = dateInterval(range);
      const starts: number[] = [];
      for (let cursor = bounds.start; cursor < bounds.end; cursor += HOUR) starts.push(cursor);
      const labels = starts.map(timeLabel);
      starts.forEach((start,index) => {
        const label = labels[index];
        const interval: Interval = { start,end:start+HOUR };
        buckets.push({ label: labels.indexOf(label) === labels.lastIndexOf(label) ? label : label + (labels.indexOf(label) === index ? ' A' : ' B'),
          totals:day?summarize(day,ids,interval):emptyTotals() });
      });
    } else if (days.length <= 45 && !monthly) {
      for (const day of days) add(day.slice(8) + '.' + day.slice(5,7) + '.',day,shiftDay(day,1));
    } else {
      for (let month = range.from.slice(0,7)+'-01'; month < end; month=shiftMonth(month,1)) {
        const next = shiftMonth(month,1);
        add(month.slice(5,7)+'/'+month.slice(2,4),month<range.from?range.from:month,next>end?end:next);
      }
    }
    const runs = days.flatMap(day=>this.days.get(day)?.runs??[])
      .filter(run=>ids.includes(run.machineId)&&run.outcome==='completed').sort((a,b)=>b.end-a.end);
    return { total,buckets,runs };
  }
}
