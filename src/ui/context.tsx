import { createContext, useContext } from 'react';
import { update } from '../data/db';
import type { State } from '../data/types';

export const WorkshopContext = createContext<{ state: State; notify: (message: string, error?: boolean) => void } | null>(null);
export function useWorkshop() {
  const context = useContext(WorkshopContext);
  if (!context) throw new Error('Baza nije učitana.');
  const { state, notify } = context;
  const run = async (work: () => unknown | Promise<unknown>, message?: string) => {
    try {
      await work();
      if (message) notify(message);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Operacija nije uspela.', true);
      return false;
    }
  };
  const save = (change: (state: State) => void, message?: string) => run(() => update(change), message);
  return { state, notify, run, save };
}

