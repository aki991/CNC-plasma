import { mkdir, writeFile } from 'node:fs/promises';
import { catalog, thumbnail } from '../src/data/catalog';
import { parseDxf } from '../src/geometry/dxf';

await mkdir('public/models', { recursive: true });
for (const model of catalog) {
  const actual = parseDxf(model.raw);
  if (!actual.valid) throw new Error(model.id + ': ' + actual.issues.join(', '));
  await writeFile('public/models/' + model.filename, model.raw);
  await writeFile('public/models/' + model.id.toLowerCase() + '.svg', thumbnail(actual.shape));
}
console.log('Validirano ' + catalog.length + ' DXF modela.');

