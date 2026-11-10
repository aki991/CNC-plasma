import type { Interval } from './types';

export const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const zone = 'Europe/Belgrade';
const localParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const timeFormat = new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: zone, dateStyle: 'medium' });
function parts(timestamp: number) {
  return Object.fromEntries(localParts.formatToParts(timestamp).map(part => [part.type, part.value]));
}
export function localDay(timestamp: number) {
  const { year, month, day } = parts(timestamp);
  return year + '-' + month + '-' + day;
}
export function shiftDay(day: string, by: number) {
  return new Date(Date.parse(day) + by * DAY).toISOString().slice(0, 10);
}
export function shiftMonth(day: string, by: number) {
  const date = new Date(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + by, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(last, date.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export function atLocal(day: string, hour = 0) {
  const target = Date.parse(day) + hour * HOUR;
  // Calendar boundaries and shift times avoid the ambiguous hour during the DST change.
  let utc = target;
  for (let iteration = 0; iteration < 3; iteration++) {
    const p = parts(utc);
    const clock = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + 'Z');
    if (clock === target) break;
    utc += target - clock;
  }
  return utc;
}
export function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day < end; day = shiftDay(day, 1)) days.push(day);
  return days;
}
export const timeLabel = (timestamp: number) => timeFormat.format(timestamp);
export const dateTimeLabel = (timestamp: number) => dateFormat.format(timestamp) + ' · ' + timeLabel(timestamp);
export function duration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(value => String(value).padStart(2, '0')).join(':');
}
export function shortDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' min' : minutes ? minutes + ' min' : Math.floor(seconds) + ' s';
}
export const secondsIn = (a: Interval, b: Interval) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 1000;
export type Period = 'today' | 'week' | 'month' | 'year' | 'custom';
export type DateRange = { from: string; to: string };
export function selectRange(period: Period, day: string, custom: DateRange): DateRange {
  if (period === 'custom') return custom;
  const from = period === 'week' ? shiftDay(day, -6) : period === 'month' ? day.slice(0, 7) + '-01' :
    period === 'year' ? day.slice(0, 4) + '-01-01' : day;
  return { from, to: day };
}
export const dateInterval = (range: DateRange): Interval => ({ start: atLocal(range.from), end: atLocal(shiftDay(range.to, 1)) });
