import type { Model } from '../data/types';
import type { VoronoiSettings } from './voronoi';

export type PanelMode = 'repeat' | 'fixed' | 'proportional' | 'parametric' | 'voronoi';
export type PanelChoice = {
  modelId: string; mode: PanelMode; fixedSize?: true; opening?: number; bridge?: number; border?: number;
  voronoi?: VoronoiSettings;
};
export type Post = { id: string; type?: 'steel' | 'aluminum' | 'concrete'; width?: number; height?: number };
export type Segment = {
  id: string; kind: 'panel' | 'single' | 'double'; width: number; locked: boolean;
  top?: number; ground?: number; plinthHeight?: number; sideGap?: number; meetingGap?: number; leftLeaf?: number;
  panels: [PanelChoice, PanelChoice];
};
export type FenceDesign = {
  name: string; customerId: string; material: string; thickness: number;
  height: number; ground: number; sideGap: number; topGap: number; meetingGap: number; frame: number;
  plinthHeight?: number;
  postWidth: number; postHeight: number; postType: NonNullable<Post['type']>;
  posts: Post[]; segments: Segment[];
};
export type ProductionSize = { segmentId: string; leaf: number; opening: number; width: number; height: number };
export type FenceSummary = {
  length: number; height: number; postCount: number; segmentWidths: number[]; panelCount: number;
  sheetPartCount: number; frameMeters: number; gateCount: number;
};
export type GeneratedFence = { key: string; parts: Model[]; dimensions: ProductionSize[]; summary: FenceSummary };
export type FenceProject = {
  id: string; design: FenceDesign; revision: number; updatedAt: string; generated?: GeneratedFence; jobId?: string;
  fieldSource?: { key: string; revision: number };
};
export type FenceOrder = FenceSummary & { projectId: string; name: string; key: string };

