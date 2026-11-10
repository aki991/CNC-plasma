import { expect, test } from '@playwright/test';

test('Brisanje količine i debljine ostavlja prazno polje do sledećeg unosa', async ({ page }) => {
  await page.goto('/poslovi/P-1058');
  const quantity = page.getByRole('spinbutton', { name: 'Količina og-005.dxf' });
  await quantity.press('ControlOrMeta+a');
  await quantity.press('Backspace');
  await quantity.press('Tab');
  await expect(quantity).toHaveValue('');

  const save = page.getByRole('button', { name: 'Sačuvaj posao' });
  await save.click();
  await expect(quantity).toBeFocused();
  await expect(quantity).toHaveValue('');
  await quantity.pressSequentially('17');

  const thickness = page.getByRole('spinbutton', { name: 'Debljina (mm)' });
  await thickness.clear();
  await thickness.press('Tab');
  await expect(thickness).toHaveValue('');
  await thickness.pressSequentially('0.5');
  await expect(thickness).toHaveValue('0.5');
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Posao je sačuvan.');
  await page.reload();
  await expect(quantity).toHaveValue('17');
  await expect(thickness).toHaveValue('0.5');
});

test('Prazan popust traži unos, a ručno uneta nula ostaje važeća', async ({ page }) => {
  await page.goto('/kalkulacije/P-1058');
  const discount = page.getByRole('spinbutton', { name: 'Popust', exact: true });
  await discount.fill('8');
  await discount.clear();
  const save = page.getByRole('button', { name: 'Sačuvaj kalkulaciju' });
  await save.click();
  await expect(discount).toBeFocused();
  await expect(discount).toHaveValue('');
  await expect(page.getByRole('status')).toHaveCount(0);
  await discount.fill('0');
  await save.click();
  await expect(discount).toHaveValue('0');
  await expect(page.getByRole('status')).toHaveText('Kalkulacija je sačuvana.');
});

test('Optimizacija vraća fokus na prazno polje u sklopljenim podešavanjima', async ({ page }) => {
  await page.goto('/nesting/P-1058');
  const advanced = page.getByText('Napredna podešavanja', { exact: true });
  await advanced.click();
  const seconds = page.getByRole('spinbutton', { name: 'Vreme optimizacije' });
  await seconds.clear();
  await advanced.click();
  await expect(seconds).toBeHidden();

  await page.getByRole('button', { name: 'Optimizuj ponovo' }).click();
  await expect(seconds).toBeFocused();
  await expect(seconds).toHaveValue('');
  await expect(page.getByRole('status')).toHaveCount(0);
});
