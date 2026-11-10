import { useRef, useState } from 'react';
import type { State } from '../data/types';
import { useWorkshop } from '../ui/context';
import type { EditDesign } from './Inspector';
import type { FenceDesign, FenceProject } from './types';

export function findFence(state: State, id: string) {
  return state.fenceProjects?.find(project => project.id === id);
}

export function useFenceDraft(initial: FenceProject) {
  const { save, notify } = useWorkshop();
  const [project, setProject] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const current = useRef(initial);
  const savedRevision = useRef(initial.revision);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const history = useRef<{ past: FenceDesign[]; future: FenceDesign[]; group?: string }>({ past: [], future: [] });

  // Queue completed editor gestures in the same IndexedDB transaction stream as the rest of CNC CUT PRO.
  function persist(patch: Partial<Pick<FenceProject, 'design' | 'generated'>>) {
    const next = { ...current.current, ...patch, revision: current.current.revision + 1, updatedAt: new Date().toISOString() };
    current.current = next;
    setProject(next);
    setStatus('saving');
    const pending = queue.current.then(() => save(data => {
      const stored = findFence(data, next.id);
      if (!stored || stored.revision !== savedRevision.current)
        throw new Error('Projekat je promenjen u drugom prozoru. Ponovo ga otvorite.');
      Object.assign(stored, next);
    })).then(ok => {
      if (ok) savedRevision.current = next.revision;
      if (current.current === next) setStatus(ok ? 'saved' : 'error');
      return ok;
    });
    queue.current = pending;
    return pending;
  }

  const edit: EditDesign = (apply, group) => {
    try {
      const old = current.current.design;
      const design = apply(old);
      if (JSON.stringify(old) === JSON.stringify(design)) return;
      const stack = history.current;
      if (!group || stack.group !== group) stack.past = [...stack.past, old].slice(-100);
      stack.future = [];
      stack.group = group;
      void persist({ design });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Izmena nije uspela.', true);
    }
  };
  const undo = () => {
    const stack = history.current;
    const design = stack.past.pop();
    if (!design) return;
    stack.group = undefined;
    stack.future.unshift(current.current.design);
    void persist({ design });
  };
  const redo = () => {
    const stack = history.current;
    const design = stack.future.shift();
    if (!design) return;
    stack.group = undefined;
    stack.past.push(current.current.design);
    void persist({ design });
  };
  return { project, current, status, edit, persist, undo, redo,
    canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0,
    endGroup: () => { history.current.group = undefined; }, flush: () => queue.current };
}

