import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowRight, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { bounds, pathData, type Ring, type Shape } from '../geometry/polygon';
import { num } from '../data/business';
import { statuses, type Status } from '../data/types';

export function Heading({ icon: Icon, title, children, subtitle }: { icon: LucideIcon; title: string; children?: ReactNode; subtitle: string }) {
  return <div className="page-heading"><div><h1><Icon aria-hidden="true"/>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-actions">{children}</div>}</div>;
}
export function Card({ title, icon: Icon, action, children, className = '' }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <header className="card-heading"><h2>{Icon && <Icon aria-hidden="true"/>}{title}</h2>{action}</header>}{children}</section>;
}
export function Button({ children, icon: Icon, variant = '', className = '', validateNumbers, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; variant?: string; validateNumbers?: boolean }) {
  return <button type="button" {...props} className={'button ' + variant + ' ' + className} onClick={event => {
    if (validateNumbers) {
      const scope = event.currentTarget.closest('dialog, main');
      const invalid = scope?.querySelector<HTMLInputElement>('input[type="number"]:invalid');
      if (invalid && !invalid.reportValidity()) return;
    }
    onClick?.(event);
  }}>{Icon && <Icon aria-hidden="true"/>}{children}</button>;
}
export function TextLink({ to, children, arrow = true }: { to: string; children: ReactNode; arrow?: boolean }) {
  return <Link className="text-link" to={to}>{children}{arrow && <ArrowRight size={16}/>}</Link>;
}
export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  const id = useId();
  const control = isValidElement<{ 'aria-labelledby'?: string; 'aria-label'?: string }>(children) && typeof children.type === 'string' && !children.props['aria-label']
    ? cloneElement(children, { 'aria-labelledby': id })
    : children;
  return <label className="field"><span id={id}>{label}{required && <b className="required" aria-hidden="true"> *</b>}</span>{control}</label>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={wide ? 'dialog wide' : 'dialog'} onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-inner"><header><h2>{title}</h2><Button icon={X} aria-label="Zatvori" variant="bare" onClick={onClose}/></header>{children}</div>
  </dialog>;
}
export function Badge({ status }: { status: Status }) {
  return <span className={'badge stage-' + statuses.indexOf(status)}><span className="status-dot"/>{status}</span>;
}
export function Thumbnail({ shape, preview, className = '', label }: { shape: Shape; preview?: Ring[]; className?: string; label?: string }) {
  const rings = shape.rings.length ? shape.rings : preview ?? [];
  if (!rings.length) return <span className={'drawing empty-drawing ' + className}>DXF</span>;
  const b = bounds(rings);
  const padding = Math.max(b.width, b.height) * .028 || 2;
  const d = shape.rings.length ? pathData(rings) : rings.map(ring => 'M' + ring.map(p => p.x + ',' + p.y).join('L')).join(' ');
  return <svg className={'drawing ' + className} role="img" aria-label={label ?? 'DXF geometrija'} viewBox={[b.minX-padding,b.minY-padding,b.width+2*padding,b.height+2*padding].join(' ')}>
    <path transform={'translate(0 ' + (b.minY + b.maxY) + ') scale(1 -1)'} d={d} fillRule="evenodd" fill={shape.rings.length ? 'currentColor' : 'none'} stroke="currentColor" vectorEffect="non-scaling-stroke" strokeWidth=".7"/>
  </svg>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Donut({ value, label = 'Iskorišćenost' }: { value: number; label?: string }) {
  return <div className="donut" role="img" aria-label={label + ' ' + num(value, 1) + ' %'}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" className="donut-track"/>
      <circle cx="50" cy="50" r="43" pathLength="100" strokeDasharray={numDash(value)} className="donut-value"/></svg>
    <div><strong>{num(value, 1)} %</strong><span>{label}</span></div>
  </div>;
}
const numDash = (n: number) => Math.max(0, Math.min(100, n)) + ' 100';
export function Metric({ icon: Icon, label, value, detail, tone = 'blue', chip }: {
  icon: LucideIcon; label: string; value: ReactNode; detail?: ReactNode; tone?: string; chip?: ReactNode;
}) {
  return <Card className="metric"><div className={'metric-icon ' + tone}><Icon/></div><div className="metric-copy">
    <h2>{label}</h2><div className="metric-value"><strong>{value}</strong>{chip}</div>{detail && <p>{detail}</p>}</div></Card>;
}
export function NumberField({ value, onChange, min = 0, max, step = 'any', label }: {
  value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number | string; label: string;
}) {
  const [draft, setDraft] = useState<{ base: number; text: string }>();
  if (draft && draft.base !== value) setDraft(undefined);
  const upper = max ?? Infinity;
  return <input aria-label={label} type="number" required min={min} max={max} step={step} value={draft?.base === value ? draft.text : value}
    onChange={event => {
      const input = event.currentTarget;
      const number = input.valueAsNumber;
      if (!Number.isFinite(number) || number < min || number > upper) {
        setDraft({ base: value, text: input.value });
        return;
      }
      setDraft(undefined);
      onChange(number);
    }}
    onBlur={event => {
      const number = event.currentTarget.valueAsNumber;
      if (Number.isFinite(number) && (number < min || number > upper)) {
        setDraft(undefined);
        onChange(Math.max(min, Math.min(upper, number)));
      }
    }}
    onInvalid={event => {
      const details = event.currentTarget.closest('details');
      if (details) details.open = true;
    }}
  />;
}
export function Table({ head, children, className = '' }: { head: string[]; children: ReactNode; className?: string }) {
  return <div className={'table-scroll ' + className}><table><thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

