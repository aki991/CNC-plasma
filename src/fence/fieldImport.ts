import type { State } from '../data/types';
import { uid } from '../data/business';
import { newFence } from './layout';
import { packageSchema, type ProjectPackage } from './fieldContract';
import type { FenceProject, PanelChoice } from './types';

export type FieldImport = { key: string; packet: ProjectPackage; projects: { kind: 'fence' | 'gate'; id: string }[] };
const packetKey = (p: ProjectPackage) => p.companyId + '/' + p.id;
export function readFieldPacket(value: unknown) {
  const result = packageSchema.safeParse(value);
  if (!result.success) throw new Error('Paket nije validan CNC CUT FIELD v1 zapis. ' + result.error.issues[0].message);
  for (const photo of result.data.photos) {
    const prefix = atob(photo.data.slice(23, 27));
    if (prefix !== '\xff\xd8\xff') throw new Error('Paket sadrži neispravnu JPEG fotografiju.');
  }
  return result.data;
}
export function storeFieldPacket(state: State, packet: ProjectPackage) {
  const key = packetKey(packet);
  const records = state.fieldImports ??= [];
  const index = records.findIndex(record => record.key === key);
  const old = records[index];
  if (old?.packet.revision > packet.revision) return old;
  if (old?.packet.revision === packet.revision) {
    const comparable = (p: ProjectPackage) => JSON.stringify({ ...p, status: undefined });
    if (comparable(old.packet) !== comparable(packet)) throw new Error('Postoji drugi zapis sa istom revizijom.');
    if (packet.status === 'Poslato') old.packet.status = packet.status;
    return old;
  }
  const next = { key, packet, projects: [] };
  if (index < 0) records.unshift(next); else records[index] = next;
  return next;
}
export function conversionIssue(packet: ProjectPackage, kind: 'fence' | 'gate') {
  const { fence, gate } = packet.geometry;
  if (kind === 'fence') {
    if (!fence) return 'Paket ne sadrži ogradu.';
    if (fence.segments.some(s => s.start !== s.end || s.start !== fence.segments[0].start))
      return 'Ova ograda ima različite kote. Koristite terenske mere za ručnu pripremu.';
    if (fence.segments.some(s => s.leftGap !== s.rightGap))
      return 'Ova ograda ima nesimetrične zazore. Proverite montažu u ručnoj pripremi.';
  } else if (!gate || gate.type === 'Klizna') return 'Klizna kapija zahteva ručnu pripremu.';
  return '';
}
export function createFieldProject(state: State, key: string, kind: 'fence' | 'gate'): FenceProject {
  const item = state.fieldImports?.find(item => item.key === key);
  if (!item) throw new Error('Terensko merenje nije pronađeno.');
  const oldId = item.projects.find(p => p.kind === kind)?.id;
  const old = state.fenceProjects?.find(p => p.id === oldId);
  if (old) return old;
  const { packet } = item;
  const issue = conversionIssue(packet, kind);
  if (issue) throw new Error(issue);
  const source = packet.visit.customer;
  const customerId = 'field:' + packet.companyId + ':' + source.id;
  const known = state.customers.find(c => c.id === customerId) ??
    state.customers.find(c => c.name.trim() === source.name && c.address.trim() === source.address);
  if (!known) state.customers.push({ ...source, id: customerId, email: '', taxId: '' });
  const project = newFence();
  project.fieldSource = { key, revision: packet.revision };
  const design = project.design;
  design.name = source.name + ' – ' + (kind === 'fence' ? 'ograda' : 'kapija');
  design.customerId = known?.id ?? customerId;
  design.ground = 0;
  design.postHeight = 0;
  function panel(modelId: string): [PanelChoice, PanelChoice] {
    if (!state.models.some(m => m.id === modelId)) throw new Error('Model ' + modelId + ' nedostaje u CNC CUT PRO biblioteci.');
    return [{ modelId, mode: 'repeat' }, { modelId, mode: 'repeat' }];
  }
  if (kind === 'fence') {
    const f = packet.geometry.fence!;
    design.height = Math.max(...f.segments.map(s => s.height));
    design.posts = f.posts.map(p => ({ id: uid(), width: p.width, height: p.height }));
    design.segments = f.segments.map(s => ({ id: uid(), kind: 'panel', width: s.width, locked: s.locked,
      top: s.height, sideGap: s.leftGap, panels: panel(packet.geometry.modelId) }));
  } else {
    const g = packet.geometry.gate!;
    design.height = g.height;
    design.posts = [g.postLeft, g.postRight].map(width => ({ id: uid(), width, height: g.height }));
    design.segments = [{ id: uid(), kind: g.type === 'Dvokrilna' ? 'double' : 'single', width: g.width, locked: true,
      top: g.height, sideGap: g.sideGap, meetingGap: g.meetingGap,
      leftLeaf: g.type === 'Dvokrilna' ? g.leftLeaf : undefined, panels: panel(g.modelId) }];
  }
  (state.fenceProjects ??= []).unshift(project);
  item.projects = item.projects.filter(p => p.kind !== kind).concat({ kind, id: project.id });
  return project;
}

