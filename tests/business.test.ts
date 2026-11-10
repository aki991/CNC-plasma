import { describe, expect, it } from 'vitest';
import { available, calculation, createQuote, setStatus, totals } from '../src/data/business';
import { seed } from '../src/data/seed';
import { sheetStats } from '../src/geometry/nesting';

describe('Radionica',()=>{
  it('starts with related customers, jobs, stock and quotes',()=>{
    const s=seed();
    expect(s.models).toHaveLength(20);
    expect(s.customers.length).toBeGreaterThanOrEqual(15);
    expect(s.jobs.length).toBeGreaterThanOrEqual(20);
    expect(s.quotes.length).toBeGreaterThanOrEqual(12);
    expect(s.jobs.every(j=>s.customers.some(c=>c.id===j.customerId))).toBe(true);
    expect(s.jobs.filter(j=>j.nest).every(j=>sheetStats(j.nest!.sheets).count===j.parts.reduce((sum,p)=>sum+p.quantity,0))).toBe(true);
    expect(s.inventory.every(stock=>available(s,stock)>=0)).toBe(true);
  });
  it('prices the placed geometry and reconciles customer PDF line prices with discount and VAT',()=>{
    const state=seed();
    const job=state.jobs[0];
    const calc=calculation(state,job);
    const stats=sheetStats(job.nest!.sheets);
    expect(calc.lines.find(l=>l.key==='pierce')?.quantity).toBe(stats.pierces);
    expect(calc.lines.find(l=>l.key==='sheet')?.quantity).toBeCloseTo(stats.area/1e6,4);
    calc.discount=10;calc.margin=20;calc.vat=20;
    const amount=totals(calc);
    const quote=createQuote(state,job,calc);
    expect(quote.lines.reduce((sum,l)=>sum+l.rate*l.quantity,0)).toBeCloseTo(quote.subtotal,2);
    expect(quote.total).toBe(amount.total);
    expect(quote.lines.map(line=>line.key)).not.toContain('overhead');
    expect(quote).not.toHaveProperty('margin');
  });
  it('skips postprocessing for CNC services and records completion',()=>{
    const s=seed(), job=s.jobs.find(j=>j.kind==='cnc'&&j.status!=='Završeno')!;
    expect(()=>setStatus(s,job.id,'Zavarivanje / obrada')).toThrow();
    setStatus(s,job.id,'Završeno');
    expect(job.progress).toBe(100);
    expect(job.completedAt).toBeTruthy();
    expect(s.activities[0].title).toContain(job.name);
  });
});

