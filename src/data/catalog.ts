import { writeDxf } from '../geometry/dxf';
import { makeShape, pathData, type Ring } from '../geometry/polygon';

export const rectangle = (x: number, y: number, w: number, h: number): Ring => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
function ellipse(x: number, y: number, rx: number, ry: number, vertices = 24, angle = 0): Ring {
  const r = angle * Math.PI / 180;
  return Array.from({ length: vertices }, (_, i) => {
    const a = i * 2 * Math.PI / vertices;
    return { x: x + rx * Math.cos(a) * Math.cos(r) - ry * Math.sin(a) * Math.sin(r),
      y: y + rx * Math.cos(a) * Math.sin(r) + ry * Math.sin(a) * Math.cos(r) };
  });
}
function grid(w: number, h: number, columns: number, rows: number, draw: (x: number, y: number, dx: number, dy: number, i: number, j: number) => Ring) {
  const dx = (w - 44) / columns, dy = (h - 44) / rows;
  return Array.from({ length: rows }, (_, j) => Array.from({ length: columns }, (_, i) =>
    draw(22 + (i + .5) * dx, 22 + (j + .5) * dy, dx, dy, i, j))).flat();
}
function slit(x: number, y: number, w: number, h: number, skew = 0): Ring {
  return [{ x: x - w / 2 + skew, y: y - h / 2 }, { x: x + w / 2 + skew, y: y - h / 2 },
    { x: x + w / 2 - skew, y: y + h / 2 }, { x: x - w / 2 - skew, y: y + h / 2 }];
}
function leaf(x: number, y: number, length: number, width: number, angle: number): Ring {
  const r = angle * Math.PI / 180;
  const upper = Array.from({ length: 11 }, (_, i) => ({ u: (i / 10 - .5) * length, v: Math.sin(Math.PI * i / 10) ** .85 * width }));
  const outline = [...upper, ...upper.slice(1, -1).reverse().map(p => ({ u: p.u, v: -p.v }))];
  return outline.map(({ u, v }) => ({ x: x + u * Math.cos(r) - v * Math.sin(r), y: y + u * Math.sin(r) + v * Math.cos(r) }));
}
const leafGrid = (w: number, h: number, c = 7, r = 4) => grid(w, h, c, r, (x,y,dx,dy,i,j) =>
  leaf(x + (j % 2 ? .07 : -.07) * dx, y, Math.min(dx,dy) * (.79 + .1 * (i % 2)), Math.min(dx,dy) * .19, (i+j)%2 ? -35 : 36));
const arch = (w: number, h: number): Ring => [{x:0,y:0},{x:w,y:0}, ...Array.from({length: 21}, (_, i) => {
  const t = 1 - i / 20;
  return { x: t * w, y: h * (.80 + .20 * Math.sin(Math.PI * t)) };
})];
const bracket: Ring = [{x:0,y:0},{x:180,y:0},{x:180,y:52},{x:71,y:52},{x:71,y:145},{x:0,y:145}];
const wavy = (w: number, y: number, index: number) => {
  const pts = Array.from({ length: 32 }, (_, i) => ({ x: 30 + i * (w - 60) / 31, y: y + 14 * Math.sin(i / 4 + index * .6) }));
  return [...pts.map(p => ({ ...p, y: p.y - 12 })), ...pts.reverse().map(p => ({ ...p, y: p.y + 12 }))];
};
type Entry = [string, string, number, number, (w: number, h: number) => Ring[], ((w: number, h: number) => Ring)?];
const entries: Entry[] = [
  ['Vertikalne lamele','Ograde',1050,540,(w,h)=>grid(w,h,12,1,(x,y,dx,dy)=>slit(x,y,dx*.59,dy*.94))],
  ['Horizontalne lamele','Ograde',1100,510,(w,h)=>grid(w,h,1,8,(x,y,dx,dy)=>slit(x,y,dx*.96,dy*.58))],
  ['Geometrijska ograda','Ograde',880,420,(w,h)=>grid(w,h,8,4,(x,y,dx,dy,i,j)=>ellipse(x,y,dx*.36,dy*.36,(i+j)%2 ? 3 : 4, 15))],
  ['Drvo života','Paneli',900,600,(w,h)=>[
    [{x:425,y:60},{x:470,y:60},{x:465,y:180},{x:570,y:260},{x:551,y:286},{x:458,y:230},{x:440,y:330},{x:407,y:326},{x:420,y:215},{x:341,y:274},{x:323,y:250},{x:426,y:162}],
    ...leafGrid(w,240,8,3).map(r=>r.map(p=>({...p,y:p.y+h-250}))),
    leaf(220,212,137,24,-33),leaf(674,219,143,23,24),leaf(175,125,102,19,33),leaf(732,139,113,21,-29)
  ]],
  ['Grančice i lišće','Paneli',1000,470,(w,h)=>[
    ...leafGrid(w,h,8,4), ...grid(w,h,2,1,(x)=>slit(x,18,128,6))
  ]],
  ['Kružni otvori','Paneli',900,490,(w,h)=>grid(w,h,9,5,(x,y,dx,dy,i,j)=>ellipse(x,y,Math.min(dx,dy)*(.23+((i+j)%3)*.04),Math.min(dx,dy)*(.23+((i+j)%3)*.04)))],
  ['Heksagonalni otvori','Paneli',950,500,(w,h)=>grid(w,h,9,5,(x,y,dx,dy,i,j)=>ellipse(x+(j%2 ? 7 : -7),y,dx*.39,dy*.41,6,30))],
  ['Dijagonalne linije','Ograde',1130,520,(w,h)=>grid(w,h,8,2,(x,y,dx,dy)=>slit(x,y,dx*.42,dy*.84,dx*.20))],
  ['Minimalistička ograda','Ograde',1000,540,(w,h)=>grid(w,h,6,3,(x,y,dx,dy,i,j)=>slit(x,y,dx*.85,dy*(i%2?.32:.58),(j-1)*13)),(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h-42},{x:w-42,y:h},{x:42,y:h},{x:0,y:h-42}]],
  ['Talasasti prorezi','Paneli',1020,490,(w,h)=>Array.from({length:7},(_,i)=>wavy(w,53+i*(h-106)/6,i))],
  ['Razgranati motiv','Paneli',950,510,(w,h)=>grid(w,h,8,4,(x,y,dx,dy,i,j)=>leaf(x,y,Math.min(dx,dy)*.92,dy*.19,(i-3.5)*11+(j%2?36:-36)))],
  ['Romboidna šara','Ograde',880,460,(w,h)=>grid(w,h,8,5,(x,y,dx,dy)=>ellipse(x,y,dx*.43,dy*.43,4))],
  ['Industrijska perforacija','Paneli',710,410,(w,h)=>grid(w,h,13,7,(x,y,dx,dy,i,j)=>ellipse(x+(j%2?4:-4),y,dx*.23,dy*.23,(i+j)%2?12:16))],
  ['Organska geometrija','Paneli',915,475,(w,h)=>grid(w,h,7,4,(x,y,dx,dy,i,j)=>ellipse(x,y,dx*.40,dy*.31,5+(i+j)%4,i*21+j*14))],
  ['Dvokrilna kapija','Kapije',1380,690,(w,h)=>[
    ...grid(w-42,h*.72,12,3,(x,y,dx,dy,i,j)=>leaf(x+(i>=6?41:0),y,dy*.84,dx*.20,(i<6?1:-1)*(30+j*16))),
    ...grid(w,h*.11,10,1,(x,y,dx,dy,i)=>ellipse(x,y+h*.73,dx*.27,dy*.36,8,i*12))
  ],arch],
  ['Klizna kapija','Kapije',1460,650,(w,h)=>grid(w,h-45,10,3,(x,y,dx,dy,i,j)=>slit(x,y,dx*.67,dy*.74,(i%3-1)*11+j*2)),(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h-50},{x:w-115,y:h},{x:0,y:h}]],
  ['Cvetni ornamenti','Paneli',960,530,(w,h)=>grid(w,h,8,5,(x,y,dx,dy,i,j)=>leaf(x,y,Math.min(dx,dy)*.84,dy*.18,((i+j)%4)*45))],
  ['Metalni paravan','Paravani',610,1120,(w,h)=>grid(w,h-75,6,12,(x,y,dx,dy,i,j)=>ellipse(x,y+38,dx*.37,dy*.34,4+(i+j)%3,i*19)),(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h-65},{x:w-65,y:h},{x:65,y:h},{x:0,y:h-65}]],
  ['Ugaoni nosač','Nosači',180,145,()=>[ellipse(28,27,9,9),ellipse(150,26,9,9),ellipse(34,115,9,9)],()=>bracket],
  ['Limene pozicije','Pozicije',240,160,()=>[ellipse(32,29,7,7),ellipse(121,30,7,7),ellipse(208,22,7,7),ellipse(45,127,9,9)],
    ()=>[{x:0,y:0},{x:144,y:0},{x:156,y:15},{x:156,y:60},{x:0,y:60}]],
];
export const catalog = entries.map(([name, category, w, h, holes, outline], i) => {
  const id = 'OG-' + String(i + 1).padStart(3, '0');
  const modelRings = [outline ? outline(w,h) : rectangle(0,0,w,h), ...holes(w,h)];
  if (i === 19) modelRings.push(ellipse(207,22,33,22,8), [{x:7,y:91},{x:85,y:91},{x:69,y:157},{x:18,y:159}]);
  return { id, name, category, material: i === 18 ? 'Čelik S355' : i === 19 ? 'Inox' : 'Čelik S235',
    thickness: i === 18 ? 8 : i === 19 ? 2 : 5, quantity: i === 18 ? 12 : i === 19 ? 6 : 4, shape: makeShape(modelRings),
    raw: writeDxf(modelRings), filename: id.toLowerCase() + '.dxf', issues: [], valid: true, builtin: true };
});
export function thumbnail(shape: ReturnType<typeof makeShape>) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+shape.width+' '+shape.height+'"><path fill="#46515e" fill-rule="evenodd" transform="translate(0 '+shape.height+') scale(1 -1)" d="'+pathData(shape.rings)+'"/></svg>';
}

