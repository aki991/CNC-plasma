import type { Ring, Shape } from '../geometry/polygon';
import type { NestResult } from '../geometry/nesting';
import type { Unit } from '../geometry/dxf';
import type { FieldImport } from '../fence/fieldImport';
import type { FenceOrder, FenceProject } from '../fence/types';

export const statuses = ['U pripremi', 'Spremno za sečenje', 'U sečenju', 'Zavarivanje / obrada', 'Završeno'] as const;
export type Status = typeof statuses[number];
export type Model = {
  id: string; name: string; filename: string; category: string; material: string; thickness: number; quantity: number;
  shape: Shape; raw: string; valid: boolean; issues: string[]; builtin?: boolean; favorite?: boolean; preview?: Ring[]; unit?: Unit;
};
export type JobPart = Model & { excluded?: boolean; fenceProjectId?: string };
export type Customer = { id: string; name: string; contact: string; phone: string; email: string; address: string; taxId: string };
export type Job = {
  id: string; name: string; customerId: string; contact: string; due: string; material: string; thickness: number;
  kind: 'cnc' | 'product'; note: string; parts: JobPart[]; status: Status; progress: number; machine: string; operator: string;
  planDate: string; start: string; end: string; nest?: NestResult; nestingAt?: string; completedAt?: string; materialConsumedAt?: string;
  fence?: FenceOrder;
};
export type Inventory = {
  id: string; material: string; thickness: number; width: number; height: number; quantity: number;
  cost: number; supplier: string; location: string; remnant: boolean; outline?: Ring;
};
export type Reservation = { jobId: string; stockId: string; quantity: number };
export type Price = { key: string; name: string; unit: string; rate: number; product?: boolean };
export type QuoteLine = { key: string; name: string; unit: string; quantity: number; rate: number };
export type Calculation = { jobId: string; lines: QuoteLine[]; margin: number; discount: number; vat: number; note: string; validity: number; updatedAt: string };
export type Quote = {
  id: string; jobId: string; jobName: string; customer: Customer; company: string; companyAddress: string; companyTaxId: string;
  date: string; expires: string; lines: QuoteLine[]; subtotal: number; total: number; vat: number; vatAmount: number;
  note: string; status: 'Otvorena' | 'Prihvaćena' | 'Odbijena';
};
export type Activity = { id: string; title: string; kind: 'nest' | 'quote' | 'dxf' | 'job' | 'stock' | 'customer'; time: string; link?: string };
export type Settings = { company: string; address: string; taxId: string; user: string; tolerance: number; speed: number; pierceSeconds: number };
export type State = {
  version: 1; jobs: Job[]; customers: Customer[]; models: Model[]; inventory: Inventory[]; reservations: Reservation[];
  quotes: Quote[]; calculations: Calculation[]; activities: Activity[]; machines: string[]; operators: string[];
  prices: Price[]; settings: Settings;
  fenceProjects?: FenceProject[];
  fieldImports?: FieldImport[];
};

