import { activity, dateAt, nextId, releaseReservation } from '../data/business';
import type { Job, State } from '../data/types';
import { fenceKey } from './panels';
import type { FenceProject } from './types';

export function compatibleFenceJob(job: Job, project: FenceProject) {
  const { design } = project;
  return job.customerId === design.customerId && job.material === design.material && job.thickness === design.thickness &&
    job.kind === 'product' && (!job.fence || job.fence.projectId === project.id);
}
const editableJob = (job: Job) => !job.materialConsumedAt && (job.status === 'U pripremi' || job.status === 'Spremno za sečenje');

export function fenceJobChoices(state: State, project: FenceProject) {
  return state.jobs.filter(job => editableJob(job) && compatibleFenceJob(job, project));
}

export function sendFenceToJob(state: State, project: FenceProject, destination: string): string {
  const { design, generated } = project;
  if (!generated || generated.key !== fenceKey(design, state.models))
    throw new Error('Generišite DXF fajlove za aktuelnu verziju projekta.');
  const customer = state.customers.find(item => item.id === design.customerId);
  if (!customer) throw new Error('Izaberite kupca u parametrima projekta.');
  if (project.jobId && project.jobId !== destination) throw new Error('Projekat je već povezan sa drugim poslom.');
  const parts = generated.parts.map(part => ({ ...part, fenceProjectId: project.id }));
  let job = state.jobs.find(item => item.id === destination);
  if (destination && (!job || !compatibleFenceJob(job, project)))
    throw new Error('Posao mora odgovarati kupcu, materijalu i debljini ovog projekta.');
  if (job) {
    const current = job.parts.filter(part => part.fenceProjectId === project.id);
    const same = job.fence?.key === generated.key && parts.length === current.length && parts.every((part, i) =>
      part.id === current[i].id && part.raw === current[i].raw && part.quantity === current[i].quantity &&
      part.material === current[i].material && part.thickness === current[i].thickness);
    if (same) return job.id;
    if (!editableJob(job)) throw new Error('Radni nalog je već u proizvodnji. Duplirajte projekat za novu verziju.');
    releaseReservation(state, job.id);
    job.parts = [...job.parts.filter(part => part.fenceProjectId !== project.id), ...parts];
    job.nest = undefined;
    job.nestingAt = undefined;
    job.progress = 0;
    job.status = 'U pripremi';
    state.calculations = state.calculations.filter(calc => calc.jobId !== job!.id);
  } else {
    job = {
      id: nextId('P-', state.jobs.map(item => item.id), 1070), name: design.name.trim(), customerId: customer.id,
      contact: customer.contact, due: dateAt(7), material: design.material, thickness: design.thickness, kind: 'product',
      note: '', parts, status: 'U pripremi', progress: 0, machine: '', operator: '', planDate: '', start: '', end: '',
    };
    state.jobs.unshift(job);
  }
  job.fence = { ...generated.summary, projectId: project.id, name: design.name.trim(), key: generated.key };
  activity(state, 'dxf', 'Paneli ograde „' + design.name.trim() + '“ dodati u ' + job.id, '/nesting/' + job.id);
  return job.id;
}

