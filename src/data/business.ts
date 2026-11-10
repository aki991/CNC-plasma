import { sheetStats } from '../geometry/nesting';
import type { Activity, Calculation, Inventory, Job, Price, Quote, State, Status } from './types';

export const uid = () => crypto.randomUUID();
export const num = (n: number, digits = 0) => n.toLocaleString('sr-Latn-RS', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const rsd = (n: number) => num(n) + ' RSD';
export const sqm = (n: number, digits = 2) => num(n / 1e6, digits) + ' m²';
export const dateAt = (offset = 0, base = new Date()) => {
  const date = new Date(base);
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE').format(date);
};
export const dateLabel = (date: string) => date ? new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
  day: 'numeric', month: 'short', year: 'numeric',
}) : '—';
export const shortDate = (date: string) => date ? new Date(date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' }) : '—';
export const quantity = (job: Job) => job.parts.reduce((sum, part) => sum + part.quantity, 0);
export const partArea = (job: Job) => job.parts.reduce((sum, part) => sum + part.quantity * part.shape.area, 0);
export const nextId = (prefix: string, ids: string[], start: number) =>
  prefix + Math.max(start, ...ids.map(id => id.startsWith(prefix) ? Number(id.slice(prefix.length)) + 1 || 0 : 0));
export const reserved = (state: State, id: string) => state.reservations.filter(r => r.stockId === id).reduce((sum, r) => sum + r.quantity, 0);
export const available = (state: State, stock: Inventory) => stock.quantity - reserved(state, stock.id);

export function releaseReservation(state: State, jobId: string) {
  if (!state.reservations.some(r => r.jobId === jobId)) return;
  state.reservations = state.reservations.filter(r => r.jobId !== jobId);
  activity(state, 'stock', 'Oslobođena rezervacija za ' + jobId, '/magacin');
}

export function activity(state: State, kind: Activity['kind'], title: string, link?: string) {
  state.activities.unshift({ id: uid(), kind, title, time: new Date().toISOString(), link });
}

export function setStatus(state: State, id: string, status: Status) {
  const job = state.jobs.find(item => item.id === id);
  if (!job || job.status === status) return;
  if (job.kind === 'cnc' && status === 'Zavarivanje / obrada') throw new Error('Za CNC uslugu prebacite nalog direktno u Završeno.');
  job.status = status;
  if (status === 'Završeno') { job.progress = 100; job.completedAt = dateAt(); }
  else {
    job.completedAt = undefined;
    job.progress = Math.min(job.progress, 99);
  }
  activity(state, 'job', job.name + ' · ' + status, '/proizvodnja/' + job.id);
}

export function cutHours(length: number, pierces: number, settings: State['settings']) {
  return length / Math.max(1, settings.speed) / 60 + pierces * settings.pierceSeconds / 3600;
}

export const initialPrices: Price[] = [
  { key: 'sheet', name: 'Materijal', unit: 'm²', rate: 5200 },
  { key: 'cut', name: 'CNC sečenje', unit: 'h', rate: 4800 },
  { key: 'pierce', name: 'Probijanje', unit: 'kom', rate: 12 },
  { key: 'finish', name: 'Dodatna obrada', unit: 'h', rate: 3200 },
  { key: 'waste', name: 'Materijalni otpad', unit: 'm²', rate: 5200 },
  { key: 'overhead', name: 'Režijski troškovi', unit: 'h', rate: 700 },
  { key: 'frame', name: 'Ram / profili', unit: 'm', rate: 1150, product: true },
  { key: 'posts', name: 'Stubovi', unit: 'kom', rate: 1550, product: true },
  { key: 'hardware', name: 'Šarke i okovi', unit: 'set', rate: 2800, product: true },
  { key: 'weld', name: 'Zavarivanje i brušenje', unit: 'h', rate: 3200, product: true },
  { key: 'coat', name: 'Plastifikacija / farbanje', unit: 'm²', rate: 2100, product: true },
  { key: 'install', name: 'Montaža', unit: 'h', rate: 2800, product: true },
  { key: 'delivery', name: 'Transport', unit: 'usluga', rate: 4000, product: true },
];
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const measure = (value: number) => Math.round(value * 10000) / 10000;

export function calculation(state: State, job: Job): Calculation {
  const stats = job.nest ? sheetStats(job.nest.sheets) : undefined;
  const parts = job.parts.filter(part => part.valid && !part.excluded);
  const area = stats?.area ?? parts.reduce((sum, part) => sum + part.shape.area * part.quantity, 0);
  const length = stats?.length ?? parts.reduce((sum, part) => sum + part.shape.length * part.quantity, 0);
  const pierces = stats?.pierces ?? parts.reduce((sum, part) => sum + part.shape.rings.length * part.quantity, 0);
  const hours = cutHours(length, pierces, state.settings);
  const count = stats?.count ?? parts.reduce((sum, part) => sum + part.quantity, 0);
  const span = parts.reduce((sum, part) => sum + part.shape.width * part.quantity / 1000, 0);
  const quantities: Record<string, number> = {
    sheet: area / 1e6, waste: (stats?.waste ?? 0) / 1e6, cut: hours, pierce: pierces, overhead: hours,
    finish: count ? .5 : 0, frame: job.fence?.frameMeters ?? span * 2, posts: job.fence?.postCount ?? (count ? count + 1 : 0),
    hardware: job.fence?.gateCount ?? Number(job.name.toLocaleLowerCase().includes('kapija')), weld: count * .25,
    coat: area / 1e6, install: (job.fence?.panelCount ?? count) * .4, delivery: count ? 1 : 0,
  };
  return { jobId: job.id, lines: state.prices.filter(price => job.kind === 'product' || !price.product).map(price => ({
    key: price.key, name: price.name, unit: price.unit, quantity: measure(quantities[price.key] ?? 0), rate: price.rate,
  })), margin: 15, discount: 0, vat: 20, note: job.note, validity: 15, updatedAt: new Date().toISOString() };
}

export function totals(calc: Calculation) {
  const cost = round(calc.lines.reduce((sum, line) => sum + round(line.rate * line.quantity), 0));
  const profit = round(cost * calc.margin / 100);
  const sale = cost + profit;
  const discount = round(sale * calc.discount / 100);
  const base = round(sale - discount);
  const vat = round(base * calc.vat / 100);
  return { cost, profit, sale, discount, base, vat, total: round(base + vat) };
}

export function createQuote(state: State, job: Job, calc: Calculation, date = dateAt()): Quote {
  const customer = state.customers.find(item => item.id === job.customerId);
  if (!customer) throw new Error('Dodelite kupca pre kreiranja ponude.');
  if (job.parts.some(part => !part.excluded && !part.valid)) throw new Error('Proverite ili isključite neispravne DXF fajlove pre kreiranja ponude.');
  if (job.nest?.unplaced.length) throw new Error('Rasporedite sve uključene delove pre kreiranja ponude.');
  const amount = totals(calc);
  if (amount.base <= 0) throw new Error('Unesite pozitivnu cenu ponude.');
  // Customer-facing rows combine related operations and omit internal cost categories.
  const groups: [string, string, string[]][] = [
    ['material', 'Lim i priprema materijala', ['sheet', 'waste']],
    ['cut', 'CNC sečenje i obrada', ['cut', 'pierce', 'finish', 'overhead']],
    ['assembly', 'Izrada i završna obrada', ['frame', 'posts', 'hardware', 'weld', 'coat']],
    ['delivery', 'Transport i montaža', ['delivery', 'install']],
  ];
  const multiplier = amount.base / amount.cost;
  const lines = groups.map(([key, name, keys]) => ({
    key, name, unit: 'usluga', quantity: 1,
    rate: round(calc.lines.filter(line => keys.includes(line.key)).reduce((sum, line) => sum + round(line.rate * line.quantity), 0) * multiplier),
  })).filter(line => line.rate > 0);
  lines[lines.length - 1].rate = round(lines.at(-1)!.rate + amount.base - lines.reduce((sum, line) => sum + line.rate, 0));
  return {
    id: nextId('PON-', state.quotes.map(q => q.id), 273), jobId: job.id, jobName: job.name,
    customer: { ...customer }, company: state.settings.company, companyAddress: state.settings.address, companyTaxId: state.settings.taxId,
    date, expires: dateAt(calc.validity, new Date(date + 'T12:00:00')), lines, subtotal: amount.base,
    total: amount.total, vat: calc.vat, vatAmount: amount.vat, note: calc.note, status: 'Otvorena',
  };
}

