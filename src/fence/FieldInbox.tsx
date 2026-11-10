import { useRef, useState } from 'react';
import { Camera, FileUp, FolderOpen, Ruler } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { checkSpace } from '../data/files';
import { useWorkshop } from '../ui/context';
import { Button, Dialog, Empty, Table } from '../ui/common';
import { mm } from './Canvas';
import { conversionIssue, createFieldProject, readFieldPacket, storeFieldPacket } from './fieldImport';
import { FieldCloud } from './FieldCloud';

const url = '/projektovanje-ograda';
export function FieldInbox({ close, initial }: { close: () => void; initial?: string }) {
  const { state, run, save } = useWorkshop();
  const [active, setActive] = useState(initial);
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const records = state.fieldImports ?? [];
  const item = records.find(row => row.key === active);
  const p = item?.packet;
  async function openProject(kind: 'fence' | 'gate') {
    if (!item) return;
    setBusy(true);
    let id = '';
    if (await save(data => { id = createFieldProject(data, item.key, kind).id; }, 'Terenski projekat je otvoren.')) {
      navigate(url + '/' + id);
      close();
    }
    setBusy(false);
  }
  return <Dialog title="Terenska merenja · CNC CUT FIELD" onClose={close} wide>
    <div className="inline-actions">
      <Button icon={FileUp} variant="primary" disabled={busy} onClick={() => file.current?.click()}>Uvezi terensko merenje</Button>
      {active && <Button onClick={() => { setActive(undefined); setPhoto(undefined); }}>Sva terenska merenja</Button>}
    </div>
    <input ref={file} hidden aria-label="CNC CUT FIELD paket" type="file" accept=".json,application/json" onChange={e => {
      const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return;
      setBusy(true);
      void run(async () => {
        if (selected.size > 12_000_000) throw new Error('Paket je veći od 12 MB.');
        await checkSpace(selected.size);
        const packet = readFieldPacket(JSON.parse(await selected.text()));
        let key = '';
        if (await save(data => { key = storeFieldPacket(data, packet).key; }, 'Terensko merenje je uvezeno.')) {
          setActive(key); setPhoto(undefined);
        }
      }).finally(() => setBusy(false));
    }}/>
    {!p ? <>
      <FieldCloud onImport={setActive}/>
      {records.length ? <Table head={['Kupac', 'Datum', 'Radnik', 'Revizija', '']}>{records.map(({ key, packet }) => <tr key={key}>
        <td>{packet.visit.customer.name}</td><td>{packet.visit.date}</td><td>{packet.worker.name}</td><td>{packet.revision}</td>
        <td><Button icon={FolderOpen} onClick={() => setActive(key)}>Otvori</Button></td>
      </tr>)}</Table> : <Empty>Uvezite paket koji je radnik preuzeo u CNC CUT FIELD.</Empty>}
    </> : <div className="field-inbox-detail">
      <h3>{p.visit.customer.name} · {p.visit.type}</h3>
      <p>{p.visit.customer.address} · {p.visit.date} {p.visit.time} · {p.worker.name} · Revizija {p.revision}</p>
      {p.visit.customer.phone && <a className="text-link" href={'tel:' + p.visit.customer.phone.replace(/[^+\d]/g, '')}>{p.visit.customer.phone}</a>}
      {p.visit.customer.contact && <p>Kontakt · {p.visit.customer.contact}</p>}
      {p.visit.gps && <p>GPS · {p.visit.gps.lat}, {p.visit.gps.lon}</p>}
      {p.visit.notes && <p className="field-note">{p.visit.notes}</p>}
      {p.geometry.fence && <>
        <h3>Ograda · {p.geometry.modelId}</h3>
        <Table head={['Segment', 'Svetli otvor', 'Visina', 'Zazori L / D', 'Kote početak / kraj']}>{p.geometry.fence.segments.map((s, i) => <tr key={s.id}>
          <td>S{i + 1}</td><td>{mm(s.width)}</td><td>{mm(s.height)}</td><td>{mm(s.leftGap)} / {mm(s.rightGap)}</td><td>{mm(s.start)} / {mm(s.end)}</td>
        </tr>)}</Table>
        <Table head={['Stub', 'Profil', 'Širina × visina', 'Stanje', 'Napomena']}>{p.geometry.fence.posts.map((s, i) => <tr key={s.id}>
          <td>P{i + 1}</td><td>{s.profile}</td><td>{mm(s.width)} × {mm(s.height)}</td><td>{s.existing ? 'Postojeći' : 'Novi'}</td><td>{s.notes}</td>
        </tr>)}</Table>
        {conversionIssue(p, 'fence') ? <p>{conversionIssue(p, 'fence')}</p> :
          <Button icon={Ruler} disabled={busy} onClick={() => void openProject('fence')}>Otvori ogradu u projektovanju</Button>}
      </>}
      {p.geometry.gate && <>
        <h3>{p.geometry.gate.type} kapija · {p.geometry.gate.modelId}</h3>
        <p>Svetli otvor {mm(p.geometry.gate.width)} · visina {mm(p.geometry.gate.height)} · {p.geometry.gate.direction}</p>
        <p>Stubovi {mm(p.geometry.gate.postLeft)} / {mm(p.geometry.gate.postRight)} · bočni zazor {mm(p.geometry.gate.sideGap)}</p>
        {p.geometry.gate.type === 'Dvokrilna' && <p>Krila {mm(p.geometry.gate.leftLeaf)} / {mm(p.geometry.gate.width - p.geometry.gate.leftLeaf - 2 * p.geometry.gate.sideGap - p.geometry.gate.meetingGap)} · centralni zazor {mm(p.geometry.gate.meetingGap)}</p>}
        {p.geometry.gate.notes && <p className="field-note">{p.geometry.gate.notes}</p>}
        {conversionIssue(p, 'gate') ? <p>{conversionIssue(p, 'gate')}</p> :
          <Button icon={Ruler} disabled={busy} onClick={() => void openProject('gate')}>Otvori kapiju u projektovanju</Button>}
      </>}
      {p.geometry.stairs && <>
        <h3>Stepenište</h3>
        <p>Rukohvat {mm(p.geometry.stairs.rail)} · položaji stubova {p.geometry.stairs.posts.map(mm).join(', ') || '—'}</p>
        <Table head={['Stepenik', 'Gazište', 'Čelo']}>{p.geometry.stairs.steps.map((s, i) => <tr key={i}>
          <td>{i + 1}</td><td>{mm(s.run)}</td><td>{mm(s.rise)}</td>
        </tr>)}</Table>
        {p.geometry.stairs.notes && <p className="field-note">{p.geometry.stairs.notes}</p>}
      </>}
      {p.quote && <p>Nacrt ponude · {p.quote.panels} panela, {p.quote.posts} stubova, {p.quote.gates} kapija.
        {p.quote.estimate !== undefined && ' Terenska procena ' + p.quote.estimate.toLocaleString('sr-Latn-RS') + ' RSD.'}</p>}
      {p.photos.length > 0 && <><h3><Camera size={18}/> Fotografije ({p.photos.length})</h3><div className="field-inbox-photos">
        {p.photos.map((pic, i) => <button key={pic.id} className="button" aria-label={'Prikaži fotografiju ' + (i + 1)} onClick={() => setPhoto(photo === pic.id ? undefined : pic.id)}>
          <img src={pic.data} alt={pic.caption || 'Fotografija objekta'}/>
        </button>)}</div>
        {photo && p.photos.filter(pic => pic.id === photo).map(pic => <figure key={pic.id}><img src={pic.data} alt={pic.caption || 'Fotografija objekta'}/>
          {pic.caption && <figcaption>{pic.caption}</figcaption>}</figure>)}
      </>}
    </div>}
  </Dialog>;
}

