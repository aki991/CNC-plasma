export interface MachineTelemetry {
  machineId: string;
  timestamp: string;
  connectionState: 'online' | 'offline';
  operatingState: 'running' | 'idle' | 'paused' | 'alarm' | 'completed' | 'unknown';
  programName: string | null;
  jobId: string | null;
  programProgressPercent: number | null;
  elapsedSeconds: number | null;
  estimatedRemainingSeconds: number | null;
  controllerAlarmCode: string | null;
  source: 'simulator' | 'machine';
}

/** Read-only boundary. Future LinuxCNC, MTConnect, OPC UA and verified Hypertherm integrations implement this contract. */
export interface MachineAdapter {
  readTelemetry(): Promise<readonly MachineTelemetry[]>;
}

export type MachineConfiguration = {
  id: string; name: string; type: 'CNC plazma' | 'CNC laser';
  controller: string; software: string; source: MachineTelemetry['source'];
};
export const machines = [
  { id: 'plasma-01', name: 'CNC plazma 01', type: 'CNC plazma', controller: 'Hypertherm EDGE Connect', software: 'Phoenix', source: 'simulator' },
  { id: 'plasma-02', name: 'CNC plazma 02', type: 'CNC plazma', controller: 'LinuxCNC', software: 'QtPlasmaC', source: 'simulator' },
] as const satisfies readonly MachineConfiguration[];
export type MachineId = typeof machines[number]['id'];
export type ActivityState = 'setup' | 'cutting' | 'idle' | 'paused' | 'alarm' | 'offline';
export const activityLabels: Record<ActivityState, string> = {
  setup: 'Priprema', cutting: 'Sečenje', idle: 'Mirovanje', paused: 'Pauza', alarm: 'Alarm', offline: 'Offline',
};
export const downtimeOptions = ['Zamena potrošnih delova', 'Čekanje materijala', 'Podešavanje mašine', 'Čišćenje', 'Kvar', 'Nedostatak radnog naloga', 'Ostalo'] as const;
export type DowntimeReason = { category: typeof downtimeOptions[number]; note: string; enteredBy: string; enteredAt: string };
export type Alarm = { code: string | null; description: string };
export type Interval = { start: number; end: number };
export type Shift = Interval & { machineId: MachineId; name: string };
export type StatusEvent = Interval & {
  id: string; machineId: MachineId; state: ActivityState; program: string | null; jobId: string | null;
  orderId?: string; alarm?: Alarm; simulatedReason?: string;
};
export type ProgramRun = Interval & {
  id: string; machineId: MachineId; program: string; jobId: string | null; orderId?: string;
  plannedSeconds: number; workSeconds: number; cutSeconds: number;
  outcome: 'completed' | 'cancelled';
};
export type OrderCompletion = { id: string; machineId: MachineId; timestamp: number };
export type OperatorConfirmation = { runId: string; by: string; at: string };
export type JobLinks = Record<MachineId, [string | null, string | null]>;
