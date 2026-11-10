import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { ProjectPackage } from '../../src/fence/fieldContract';

test('Terenski paket zadržava fotografiju i otvara postojeći tok projektovanja i DXF-a', async ({ page }) => {
  const data = await readFile('reference/Ograde/src/assets/photos/dekor-01-thumb.jpg', 'base64');
  const packet: ProjectPackage = {
    format: 'cnc-cut-field', version: 1, units: 'mm', id: 'test-field', revision: 4,
    companyId: 'abn-plasmacut', worker: { id: 'field-local', name: 'Milan Jovanović' },
    visit: { customer: { id: 'test-customer', name: 'Kovač terenski uvoz', address: 'Cara Dušana 29', contact: '', phone: '+381653333333' },
      date: '2026-11-10', time: '09:30', type: 'Ograda', notes: 'Proveriti nivelaciju' },
    updatedAt: '2026-11-10T12:00:00.000Z', status: 'Čeka slanje',
    geometry: { modelId: 'OG-002', fence: {
      segments: [{ id: 's1', width: 2320, height: 1400, leftGap: 10, rightGap: 10, start: 0, end: 0, locked: false }],
      posts: [
        { id: 'p1', width: 60, height: 1500, profile: '60 × 60', existing: true, notes: 'Postojeći temelj' },
        { id: 'p2', width: 80, height: 1500, profile: '80 × 80', existing: false, notes: '' },
      ],
    } },
    photos: [{ id: 'pic1', caption: 'Prilaz objektu', data: 'data:image/jpeg;base64,' + data }],
  };
  await page.goto('/projektovanje-ograda');
  await page.getByRole('button', { name: 'Terenska merenja', exact: true }).click();
  await page.getByLabel('CNC CUT FIELD paket').setInputFiles({ name: 'teren.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await expect(page.getByRole('heading', { name: 'Kovač terenski uvoz · Ograda' })).toBeVisible();
  await expect(page.getByText('Proveriti nivelaciju', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prikaži fotografiju 1' }).click();
  await expect(page.getByText('Prilaz objektu', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Otvori ogradu u projektovanju' }).click();
  await expect(page.getByRole('heading', { name: 'Kovač terenski uvoz – ograda' })).toBeVisible();
  await expect(page.locator('.fence-projecttitle small')).toContainText('2.460 mm');
  await page.getByRole('button', { name: 'Generiši DXF za sečenje' }).click();
  await expect(page.locator('.fence-result tbody tr')).toContainText('2.300 mm × 1.400 mm');
  await page.getByRole('button', { name: 'Terenske mere i fotografije' }).click();
  await expect(page.getByRole('heading', { name: 'Fotografije (1)' })).toBeVisible();
});

