import type { DxfResult } from '../geometry/dxf';
import { bounds, makeShape } from '../geometry/polygon';
import { uid } from './business';
import type { Model, Quote } from './types';

export function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function checkSpace(bytes: number) {
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && (estimate.usage ?? 0) + bytes * 3 > estimate.quota)
    throw new Error('Nema dovoljno lokalnog prostora za čuvanje.');
}

export async function importFiles(files: File[], material: string, thickness: number, tolerance: number): Promise<Model[]> {
  if (files.some(file => !/\.dxf$/i.test(file.name))) throw new Error('Izaberite samo DXF fajlove.');
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.some(file => file.size > 8e6) || bytes > 30e6) throw new Error('Ograničenje je 8 MB po fajlu i 30 MB po uvozu.');
  await checkSpace(bytes);
  const source = await Promise.all(files.map(file => file.text()));
  const results = await new Promise<DxfResult[]>((resolve, reject) => {
    const worker = new Worker(new URL('../geometry/import.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<DxfResult[]>) => { worker.terminate(); resolve(data); };
    worker.onerror = () => { worker.terminate(); reject(new Error('DXF obrada nije uspela.')); };
    worker.postMessage({ files: source, tolerance });
  });
  return files.map((file, index) => {
    const raw = source[index], parsed = results[index];
    const box = parsed.preview.length ? bounds(parsed.preview) : undefined;
    const shape = parsed.shape.rings.length || !box ? parsed.shape : { ...makeShape([]), width: box.width, height: box.height };
    return { id: uid(), raw, name: file.name.replace(/\.dxf$/i, ''), filename: file.name, category: 'Uvezeni',
      material, thickness, quantity: 1, shape, preview: parsed.preview, valid: parsed.valid, issues: parsed.issues, unit: parsed.unit };
  });
}

let font: Promise<string> | undefined;
export async function downloadQuote(quote: Quote) {
  const [{ jsPDF }, encoded] = await Promise.all([
    import('jspdf'),
    font ??= fetch('/SourceSans3-Regular.ttf').then(async response => {
      if (!response.ok) throw new Error('Font ponude nije dostupan.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    }).catch(error => { font = undefined; throw error; }),
  ]);
  const pdf = new jsPDF();
  pdf.addFileToVFS('SourceSans3-Regular.ttf', encoded);
  pdf.addFont('SourceSans3-Regular.ttf', 'Source Sans', 'normal');
  pdf.setFont('Source Sans');
  const format = (n: number) => n.toLocaleString('sr-Latn-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
  pdf.setTextColor('#132539'); pdf.setFontSize(25); pdf.text('PONUDA', 17, 29);
  pdf.setFontSize(11); pdf.text(quote.id, 193, 26, { align: 'right' });
  pdf.setDrawColor('#126bef'); pdf.setLineWidth(.7); pdf.line(17, 34, 193, 34);
  pdf.setFontSize(15); pdf.text(quote.company, 17, 47);
  pdf.setFontSize(10); pdf.text([quote.companyAddress, quote.companyTaxId ? 'PIB ' + quote.companyTaxId : ''].filter(Boolean), 17, 53);
  pdf.text('Datum ' + quote.date.split('-').reverse().join('.') + '.', 193, 47, { align: 'right' });
  pdf.text('Važi do ' + quote.expires.split('-').reverse().join('.') + '.', 193, 53, { align: 'right' });
  pdf.setFontSize(13); pdf.text(quote.customer.name, 17, 73);
  pdf.setFontSize(10); pdf.text([quote.customer.address, quote.customer.contact, quote.customer.email, quote.customer.taxId ? 'PIB ' + quote.customer.taxId : ''].filter(Boolean), 17, 79);
  pdf.setFontSize(14); pdf.text(pdf.splitTextToSize(quote.jobName, 174).slice(0, 2), 17, 107);
  pdf.setFillColor('#edf3fb'); pdf.rect(17, 121, 176, 9, 'F'); pdf.setFontSize(10);
  pdf.text('Opis', 20, 127); pdf.text('Količina', 125, 127, { align: 'right' });
  pdf.text('Cena', 157, 127, { align: 'right' }); pdf.text('Iznos', 190, 127, { align: 'right' });
  let y = 137;
  for (const line of quote.lines) {
    pdf.text(line.name, 20, y); pdf.text(line.quantity + ' ' + line.unit, 125, y, { align: 'right' });
    pdf.text(format(line.rate), 157, y, { align: 'right' }); pdf.text(format(line.rate * line.quantity), 190, y, { align: 'right' });
    pdf.setDrawColor('#dce4ee'); pdf.setLineWidth(.25); pdf.line(17, y + 3, 193, y + 3); y += 9;
  }
  y += 7;
  pdf.text('Osnovica', 128, y); pdf.text(format(quote.subtotal), 190, y, { align: 'right' });
  y += 7; pdf.text('PDV (' + quote.vat + ' %)', 128, y); pdf.text(format(quote.vatAmount), 190, y, { align: 'right' });
  y += 10; pdf.setFontSize(14); pdf.text('Ukupno', 128, y); pdf.text(format(quote.total), 190, y, { align: 'right' });
  if (quote.note) {
    y += 17; pdf.setFontSize(10);
    for (const line of pdf.splitTextToSize(quote.note, 174) as string[]) {
      if (y > 278) { pdf.addPage(); y = 22; }
      pdf.text(line, 17, y); y += 5;
    }
  }
  pdf.save(quote.id + '.pdf');
}

