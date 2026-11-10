import { catalog, rectangle } from './catalog';
import { calculation, createQuote, dateAt, initialPrices } from './business';
import { optimize, type NestSettings } from '../geometry/nesting';
import { writeDxf } from '../geometry/dxf';
import { makeShape } from '../geometry/polygon';
import type { Job, State } from './types';

export function seed(): State {
  const customers = ['Petrović d.o.o.', 'Markovac d.o.o.', 'Jovanović metal', 'Stil Ograde d.o.o.', 'Nikolić d.o.o.',
    'Metal Plus d.o.o.', 'Arhim d.o.o.', 'Ograde Plus d.o.o.', 'Čelični Profil', 'Studio Linija', 'Kovač Mont',
    'Montaža Dunav', 'Atelje Forma', 'Projekt Metal', 'Panel Sistem'].map((name, i) => ({
      id: 'K-' + (i + 1), name, contact: ['Petar Petrović', 'Ivan Marković', 'Nikola Jovanović', 'Jelena Ilić', 'Ana Nikolić'][i % 5],
      phone: '+381 64 555 ' + String(1200 + i), email: 'nabavka' + (i + 1) + '@primer.rs',
      address: ['Beograd', 'Novi Sad', 'Kragujevac', 'Pančevo', 'Smederevo'][i % 5], taxId: '',
    }));
  const machines = ['Laserski rezač L-3015', 'Laserski rezač L-4020', 'Plazma rezač P-3015', 'MIG/MAG – Zavarivanje', 'Obrada / brušenje'];
  const operators = ['Dejan Kostić', 'Milan Stojanović', 'Predrag Ilić', 'Zoran Vukić', 'Nenad Marković'];
  const inventory = [
    ['Čelik S235', 3, 3000, 1500, 28, 23400, 'A-01'],
    ['Čelik S235', 5, 3000, 1500, 14, 28600, 'A-02'],
    ['Inox', 2, 2500, 1250, 6, 34150, 'B-01'],
    ['Čelik S235', 2, 3000, 1500, 17, 18100, 'A-03'],
    ['Aluminijum', 3, 2500, 1250, 8, 26600, 'B-02'],
    ['Čelik S355', 8, 3000, 1500, 11, 39100, 'A-04'],
    ['Čelik S235', 5, 1400, 820, 1, 5600, 'R-01'],
  ].map(([material, thickness, width, height, quantity, cost, location], i) => ({
    id: 'M-' + (i + 1), material: String(material), thickness: Number(thickness), width: Number(width), height: Number(height),
    quantity: Number(quantity), cost: Number(cost), supplier: i === 2 ? 'Inox Centar' : 'Metal Servis',
    location: String(location), remnant: i === 6, outline: i === 6 ? rectangle(0, 0, Number(width), Number(height)) : undefined,
  }));
  const definitions: [number, string, number, number, number, Job['status'], number, number?][] = [
    [1058, 'Ograda Petrović', 0, 4, 4, 'Spremno za sečenje', 100, 0],
    [1057, 'Panel Markovac', 1, 3, 5, 'Spremno za sečenje', 100, 1],
    [1056, 'Kapija Jovanović', 2, 14, 2, 'U pripremi', 20],
    [1055, 'Dekorativni lim 3 mm', 3, 11, 9, 'U sečenju', 62, 0],
    [1054, 'Ograda Nikolić', 4, 0, 6, 'Zavarivanje / obrada', 65, 4],
    [1060, 'Limene pozicije', 5, 19, 12, 'U sečenju', 48, 1],
    [1066, 'Panel fasadni', 6, 7, 5, 'U sečenju', 37, 2],
    [1053, 'Kapija dvokrilna', 2, 14, 2, 'Zavarivanje / obrada', 78, 3],
    [1064, 'Ograda tip O-01', 4, 0, 6, 'U pripremi', 10],
    [1067, 'Panel dekorativni', 3, 10, 5, 'U pripremi', 0],
    [1069, 'Limene pozicije', 1, 19, 9, 'U pripremi', 0],
    [1068, 'Delovi za kapiju', 2, 18, 18, 'Spremno za sečenje', 100],
    [1061, 'Okvir kapije', 0, 15, 3, 'Zavarivanje / obrada', 50],
    [1048, 'Panel dekorativni', 1, 16, 4, 'Završeno', 100],
    [1049, 'Ograda tip O-02', 7, 1, 7, 'Završeno', 100],
    [1050, 'Limene pozicije', 8, 19, 10, 'Završeno', 100],
    [1051, 'Panel kružni', 9, 5, 4, 'Završeno', 100],
    [1052, 'Metalni paravan', 10, 17, 3, 'Završeno', 100],
    [1059, 'Industrijski panel', 11, 12, 4, 'Završeno', 100],
    [1062, 'Panel sa prorezima', 12, 9, 7, 'Spremno za sečenje', 100],
    [1063, 'Nosači za montažu', 13, 18, 24, 'U sečenju', 32],
    [1065, 'Ograda galerije', 14, 8, 4, 'U pripremi', 5],
  ];
  const plan: Record<number, [string, string]> = {
    1055: ['08:00', '09:30'], 1057: ['09:45', '11:30'], 1058: ['12:15', '13:00'],
    1056: ['13:30', '15:00'], 1054: ['15:15', '16:30'],
  };
  const jobs = definitions.map(([id, name, customer, modelIndex, quantity, status, progress, machine], i): Job => {
    const model = catalog[modelIndex];
    const material = id === 1066 ? 'Aluminijum' : model.material;
    const thickness = [1055, 1057, 1066, 1048].includes(id) ? 3 : model.thickness;
    const parts = [{ ...model, id: 'D-' + id + '-1', quantity, material, thickness }];
    if (id === 1058) for (const [index, partCount, width, height, name] of [
      [11,4,595,352,'Romboidni panel'], [14,2,620,490,'Krilo kapije'], [18,16,180,145,'Ugaoni nosač'],
    ] as const) {
      const source = catalog[index];
      const shape = makeShape(source.shape.rings.map(ring=>ring.map(p=>({x:p.x*width/source.shape.width,y:p.y*height/source.shape.height}))));
      parts.push({ ...source, id: 'D-' + id + '-' + (parts.length + 1), name, filename: source.id.toLowerCase()+'-'+width+'x'+height+'.dxf',
        quantity: partCount, material, thickness, shape, raw: writeDxf(shape.rings) });
    }
    const stock = inventory.find(s=>s.material===material&&s.thickness===thickness&&!s.remnant);
    const settings: NestSettings = { width: stock?.width??3000, height: stock?.height??1500, margin: 10, gap: 5, angles: [0, 90], seconds: 2,
      material, thickness, source: 'new', remnants: [] };
    const date = dateAt(status === 'Završeno' ? -(i % 4) : id === 1055 ? 0 : id === 1060 ? -1 : i % 5 + 1);
    return {
      id: 'P-' + id, name, customerId: customers[customer].id, contact: customers[customer].contact,
      due: date, material, thickness, kind: name.match(/Ograda|Kapija|Okvir/) ? 'product' : 'cnc',
      note: id === 1058 ? 'Paneli, dekorativna kapija i nosači. Plastifikacija RAL 7016.' : '',
      parts, status, progress, machine: machine === undefined ? '' : machines[machine], operator: machine === undefined ? '' : operators[machine],
      planDate: plan[id] ? dateAt() : '', start: plan[id]?.[0] ?? '', end: plan[id]?.[1] ?? '',
      nest: status === 'U pripremi' ? undefined : optimize(parts, settings, undefined, id === 1058 ? 3 : 1),
      nestingAt: status === 'U pripremi' ? undefined : dateAt(-(i % 7)),
      completedAt: status === 'Završeno' ? date : undefined,
    };
  });
  const state: State = {
    version: 1, jobs, inventory, customers, models: catalog.map((model, i) => ({ ...model, favorite: [3,4,14].includes(i) })),
    reservations: jobs.filter(job=>['P-1055','P-1057','P-1058','P-1054','P-1060'].includes(job.id)).flatMap(job=>{
      const stock=inventory.find(s=>s.material===job.material&&s.thickness===job.thickness&&!s.remnant);
      return stock&&job.nest?.sheets.length ? [{jobId:job.id,stockId:stock.id,quantity:job.nest.sheets.length}] : [];
    }),
    quotes: [], calculations: [], activities: [], machines, operators, prices: initialPrices,
    settings: { company: 'MetalPren d.o.o.', address: 'Beograd', taxId: '', user: 'Marko Petrović', tolerance: .15, speed: 1600, pierceSeconds: 1.1 },
  };
  for (const job of jobs.filter(j => !j.nest?.unplaced.length).slice(0, 12)) {
    const calc = calculation(state, job);
    state.calculations.push(calc);
    state.quotes.push(createQuote(state, job, calc, dateAt(-2)));
  }
  const now = Date.now();
  state.activities = [
    { id: 'A-1', kind: 'nest', title: 'Završen nesting za posao P-1055', link: '/nesting/P-1055', time: new Date(now - 14*60000).toISOString() },
    { id: 'A-2', kind: 'job', title: 'Pokrenuto sečenje: Dekorativni lim 3 mm', link: '/proizvodnja/P-1055', time: new Date(now - 28*60000).toISOString() },
    { id: 'A-3', kind: 'dxf', title: 'Učitan DXF fajl: og-004.dxf', link: '/poslovi/P-1057', time: new Date(now - 46*60000).toISOString() },
    { id: 'A-4', kind: 'quote', title: 'Kreirana ponuda br. PON-273', link: '/kalkulacije/P-1058', time: new Date(now - 72*60000).toISOString() },
    { id: 'A-5', kind: 'stock', title: 'Prijem materijala: Čelik S235 5 mm (4 kom)', link: '/magacin', time: new Date(now - 123*60000).toISOString() },
  ];
  return state;
}

