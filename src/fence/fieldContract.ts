import { z } from 'zod';

export const objectTypes = ['Ograda', 'Kapija', 'Ograda + kapija', 'Stepenišna ograda', 'Terasna ograda', 'Dekorativni panel', 'Ostalo'] as const;
export const statuses = ['Planirano', 'U toku', 'Sačuvano', 'Čeka slanje', 'Poslato', 'Potrebna dopuna', 'Završeno'] as const;
export const photoLimit = 10;
export const MAX_PHOTO_BYTES = 850_000;
const id = z.string().min(1).max(100);
const note = z.string().max(4000);
const text = z.string().max(200);
const mm = (min: number, max: number) => z.number().int().min(min).max(max);
const model = z.string().regex(/^OG-\d{3}$/);
const date = z.iso.date();
const instant = z.iso.datetime();
export const customerSchema = z.object({ id, name: text.trim().min(1), contact: text, phone: z.string().max(30), address: text.trim().min(1) });
export const visitSchema = z.object({
  customer: customerSchema, type: z.enum(objectTypes), date, time: z.iso.time({ precision: -1 }),
  notes: note, gps: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
});
export const segmentSchema = z.object({
  id, width: mm(100, 12000), height: mm(100, 5000), leftGap: mm(0, 1000), rightGap: mm(0, 1000),
  start: mm(-10000, 10000), end: mm(-10000, 10000), locked: z.boolean(),
}).refine(s => s.leftGap + s.rightGap < s.width, 'Zazori moraju biti manji od svetlog otvora.');
export const postSchema = z.object({
  id, width: mm(10, 1500), height: mm(100, 6000), profile: text, existing: z.boolean(), notes: note,
});
export const fenceSchema = z.object({
  segments: z.array(segmentSchema).min(1).max(40), posts: z.array(postSchema).min(2).max(41),
}).refine(f => f.posts.length === f.segments.length + 1 &&
  new Set(f.segments.map(s => s.id)).size === f.segments.length && new Set(f.posts.map(p => p.id)).size === f.posts.length,
  'Ograda mora imati jedan stub više od broja segmenata i jedinstvene oznake.');
export const gateTypes = ['Pešačka', 'Jednokrilna', 'Dvokrilna', 'Klizna'] as const;
export const gateSchema = z.object({
  type: z.enum(gateTypes), width: mm(200, 12000), height: mm(100, 5000), postLeft: mm(10, 1500), postRight: mm(10, 1500),
  sideGap: mm(0, 1000), meetingGap: mm(0, 1000), leftLeaf: mm(1, 11999), modelId: model,
  direction: z.enum(['Unutra levo', 'Unutra desno', 'Spolja levo', 'Spolja desno', 'Klizanje levo', 'Klizanje desno']), notes: note,
}).refine(g => {
  const usable = g.width - 2 * g.sideGap - (g.type === 'Dvokrilna' ? g.meetingGap : 0);
  return usable > 0 && (g.type !== 'Dvokrilna' || g.leftLeaf < usable) &&
    (g.type === 'Klizna') === g.direction.startsWith('Klizanje');
}, 'Proverite širine krila, zazore i smer otvaranja.');
const stepSchema = z.object({ run: mm(50, 1500), rise: mm(30, 700) });
export const stairsSchema = z.object({
  steps: z.array(stepSchema).min(1).max(40), rail: mm(100, 3000),
  posts: z.array(mm(0, 60000)).max(41).refine(v => new Set(v).size === v.length, 'Položaji stubova moraju biti jedinstveni.'),
  notes: note,
}).refine(s => s.posts.every(p => p <= s.steps.reduce((sum, step) => sum + step.run, 0)), 'Stub je izvan horizontalne dužine.');
export const geometrySchema = z.object({ modelId: model, fence: fenceSchema.optional(), gate: gateSchema.optional(), stairs: stairsSchema.optional() });
const quoteSchema = z.object({
  createdAt: instant, panels: mm(0, 40), posts: mm(0, 84), gates: mm(0, 1),
  area: z.number().min(0).max(2500), estimate: z.number().min(0).max(10_000_000_000).optional(),
});
export const photoMetaSchema = z.object({ id, caption: note });
const encodedPhotoSchema = photoMetaSchema.extend({
  data: z.string().max(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 30)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
});
export const packageSchema = z.object({
  format: z.literal('cnc-cut-field'), version: z.literal(1), units: z.literal('mm'),
  id, revision: mm(0, 2147483647), companyId: id, worker: z.object({ id, name: text }),
  visit: visitSchema, updatedAt: instant, status: z.enum(statuses), geometry: geometrySchema,
  photos: z.array(encodedPhotoSchema).max(photoLimit).refine(p => new Set(p.map(x => x.id)).size === p.length),
  quote: quoteSchema.optional(), archived: z.boolean().optional(),
}).refine(p => p.photos.every(photo => photo.data.slice(23).length % 4 === 0), 'Oštećen zapis fotografije.');
export type ProjectPackage = z.infer<typeof packageSchema>;
export type Visit = z.infer<typeof visitSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type Fence = z.infer<typeof fenceSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Post = z.infer<typeof postSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type Stairs = z.infer<typeof stairsSchema>;
export type Status = typeof statuses[number];

