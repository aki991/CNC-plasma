import { chromium, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseDxf } from '../../src/geometry/dxf';

test('Kupac → posao → DXF → nesting → ponuda → radni nalog → magacin', async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/kupci');
  await page.getByRole('button',{name:'Dodaj kupca'}).click();
  await page.getByLabel('Naziv kupca').fill('Radionica Test');
  await page.getByLabel('Kontakt osoba').fill('Sanja Kovačević');
  await page.getByLabel('E-mail',{exact:true}).fill('test@primer.rs');
  await page.getByRole('button',{name:'Sačuvaj kupca'}).click();
  await expect(page.getByRole('heading',{level:1,name:'Radionica Test'})).toBeVisible();
  await page.getByRole('link',{name:'Novi posao'}).click();
  await page.getByLabel('Naziv posla').fill('Kapija za testiranje');
  await page.getByLabel('Uvoz DXF fajlova').setInputFiles(['public/models/og-005.dxf','public/models/og-019.dxf']);
  await expect(page.getByText('Uvezeni DXF fajlovi (2)')).toBeVisible();
  await page.getByLabel('Količina og-005.dxf').fill('4');
  await page.getByLabel('Količina og-019.dxf').fill('3');
  await page.getByRole('button',{name:'Nastavi na nesting'}).click();
  await expect(page).toHaveURL(/\/nesting\/P-1070$/);
  await page.getByRole('button',{name:'Optimizuj raspored'}).click();
  await expect(page.getByText('Sačuvan raspored')).toBeVisible({timeout:12_000});
  const pathCount=await page.locator('.cut-part').count();
  expect(pathCount).toBe(7);
  await page.getByRole('button',{name:'Ručno uredi'}).click();
  await page.locator('.cut-part').first().press('Enter');
  await page.getByRole('button',{name:'Zaključaj',exact:true}).click();
  await expect(page.locator('.cut-part.locked')).toHaveCount(1);
  await page.getByRole('button',{name:'Poništi'}).click();
  await expect(page.locator('.cut-part.locked')).toHaveCount(0);
  await page.getByRole('button',{name:'Ponovi'}).click();
  await page.getByRole('button',{name:'Sačuvaj raspored'}).click();
  await page.reload();
  await expect(page.locator('.cut-part.locked')).toHaveCount(1);
  const dx=page.waitForEvent('download');
  await page.getByRole('button',{name:'Izvezi DXF'}).click();
  const dxf=await dx;
  expect(dxf.suggestedFilename()).toBe('P-1070-tabla-1.dxf');
  const geometry=parseDxf(await readFile((await dxf.path())!,'utf8'));
  expect(geometry.valid).toBe(true);
  expect(geometry.shape.depths.filter(d=>d===0)).toHaveLength(7);
  await page.getByRole('link',{name:'Nastavi na kalkulaciju'}).click();
  await page.getByLabel('Popust',{exact:true}).fill('8');
  await page.getByRole('button',{name:'Sačuvaj kalkulaciju'}).click();
  await page.getByRole('button',{name:'Kreiraj ponudu'}).click();
  await expect(page.getByRole('dialog')).toContainText('Ponuda je kreirana');
  const pd=page.waitForEvent('download');
  await page.getByRole('button',{name:'Generiši PDF'}).click();
  const pdf=await pd;
  const bytes=await readFile((await pdf.path())!);
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(6000);
  await pdf.saveAs(test.info().outputPath('ponuda.pdf'));
  await page.getByRole('link',{name:'Otvori ponudu'}).click();
  await expect(page.getByRole('dialog')).toContainText('Radionica Test');
  await page.goto('/proizvodnja/P-1070');
  await page.getByLabel('Mašina',{exact:true}).selectOption({label:'Laserski rezač L-3015'});
  await page.getByLabel('Radnik',{exact:true}).selectOption({label:'Dejan Kostić'});
  await page.getByLabel('Status',{exact:true}).selectOption({label:'U sečenju'});
  await page.getByLabel('Procenat završenosti').fill('48');
  await page.getByRole('button',{name:'Sačuvaj radni nalog'}).click();
  await expect(page.getByRole('status')).toHaveText('Radni nalog je sačuvan.');
  await page.getByRole('button',{name:'Rezerviši table'}).click();
  await expect(page.getByRole('status')).toHaveText('Materijal je rezervisan.');
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Potvrdi utrošak'}).click();
  await expect(page.getByRole('status')).toHaveText('Magacin je razdužen.');
  await page.goto('/magacin');
  await expect(page.getByRole('row').filter({hasText:'Čelik S235 3 mm'}).first()).toContainText('27 kom');
  await page.getByRole('button',{name:'Dodaj materijal'}).click();
  await page.getByLabel('Dobavljač').fill('Dobavljač Test');
  await page.getByLabel('Lokacija').fill('TEST-1');
  await page.getByRole('button',{name:'Sačuvaj materijal'}).click();
  await expect(page.getByText('TEST-1')).toBeVisible();
  await page.reload();
  await expect(page.getByText('TEST-1')).toBeVisible();
  await page.getByLabel('Globalna pretraga').fill('Kapija za testiranje');
  await page.getByRole('link',{name:/Kapija za testiranje/}).click();
  await expect(page.getByRole('heading',{name:'Kapija za testiranje',level:1})).toBeVisible();
  expect(errors).toEqual([]);
});

test('Prevlačenje DXF-a, potvrda jedinice i rezervna kopija',async({page})=>{
  await page.goto('/poslovi/novi');
  await page.getByLabel('Naziv posla').fill('Nosač po crtežu');
  await page.getByLabel('Kupac').selectOption({label:'Petrović d.o.o.'});
  const file=(await readFile('public/models/og-019.dxf','utf8')).replace('$INSUNITS\r\n70\r\n4','$INSUNITS\r\n70\r\n0');
  const data=await page.evaluateHandle(raw=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File([raw],'nosac.dxf'));
    return transfer;
  },file);
  await page.locator('.dropzone').dispatchEvent('drop',{dataTransfer:data});
  await expect(page.getByText('Potrebna provera',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pregled nosac.dxf'}).click();
  await expect(page.getByRole('dialog')).toContainText('Jedinica nije poznata');
  await page.getByLabel('Jedinica crteža').selectOption('4');
  await page.getByRole('button',{name:'Zatvori',exact:true}).click();
  await expect(page.getByText('Ispravan',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sačuvaj posao'}).click();
  await expect(page).toHaveURL(/\/poslovi\/P-1070$/);
  await page.goto('/nesting/P-1070');
  await page.getByRole('button',{name:'Optimizuj raspored'}).click();
  await expect(page.getByText('Sačuvan raspored')).toBeVisible();
  await page.getByRole('button',{name:'Ručno uredi'}).click();
  const placed=page.locator('.cut-part');
  const original=await placed.getAttribute('transform');
  const coordinates=await placed.evaluate(element=>{
    const path=element as SVGPathElement;
    const matrix=path.getScreenCTM()!;
    const start=new DOMPoint(10,9).matrixTransform(matrix);
    const end=new DOMPoint(110,89).matrixTransform(matrix);
    return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};
  });
  await page.mouse.move(coordinates.start.x,coordinates.start.y);
  await page.mouse.down();
  await page.mouse.move(coordinates.end.x,coordinates.end.y,{steps:5});
  await page.mouse.up();
  await expect(placed).not.toHaveAttribute('transform',original!);
  const outline=await placed.getAttribute('d');
  await page.getByRole('button',{name:'Rotiraj',exact:true}).click();
  await expect(placed).not.toHaveAttribute('d',outline!);
  await page.getByRole('button',{name:'Sačuvaj raspored'}).click();
  await expect(page.getByText('Sačuvan raspored')).toBeVisible();
  await page.goto('/podesavanja');
  const copied=page.waitForEvent('download');
  await page.getByRole('button',{name:'Izvezi kopiju'}).click();
  const path=(await (await copied).path())!;
  await page.getByLabel('Naziv firme').fill('Izmenjena radionica');
  await page.getByRole('button',{name:'Sačuvaj podešavanja'}).click();
  await expect(page.getByRole('link',{name:/Izmenjena radionica/})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Uvoz rezervne kopije').setInputFiles({
    name:'cnc-cut-pro-kopija.json',mimeType:'application/json',buffer:await readFile(path),
  });
  await expect(page.getByRole('link',{name:/MetalPren d.o.o./})).toBeVisible();
  await page.goto('/poslovi/P-1070');
  await expect(page.getByRole('heading',{level:1,name:'Nosač po crtežu'})).toBeVisible();
  await expect(page.getByText('Ispravan',{exact:true})).toBeVisible();
});

test('Kanban zadržava status posle ponovnog učitavanja',async({page})=>{
  await page.goto('/proizvodnja');
  const card=page.locator('.kanban-card').filter({hasText:'P-1056'});
  await expect(card).toBeVisible();
  await card.dragTo(page.locator('.lane-1>header'));
  await expect(page.locator('.lane-1')).toContainText('P-1056');
  await page.reload();
  await expect(page.locator('.lane-1')).toContainText('P-1056');
});

test('PWA je instalabilna i zadržava lokalne podatke bez mreže',async({baseURL},testInfo)=>{
  const context=await chromium.launchPersistentContext(testInfo.outputPath('chrome-profile'),{
    channel:'chrome',headless:true,baseURL,viewport:{width:1920,height:1080},
  });
  try {
    const page=context.pages()[0]??await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading',{level:1,name:'Kontrolna tabla'})).toBeVisible();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    const session=await context.newCDPSession(page);
    const result=await session.send('Page.getInstallabilityErrors');
    expect(result.installabilityErrors).toEqual([]);
    await context.setOffline(true);
    await page.goto('/projektovanje-ograda');
    await page.getByRole('button',{name:'Novi projekat',exact:true}).click();
    await page.getByRole('button',{name:'Generiši DXF za sečenje'}).click();
    await expect(page.locator('.fence-result tbody tr')).toContainText('1.780 mm × 1.120 mm');
    await page.goto('/nesting/P-1058');
    await expect(page.getByText('Sačuvan raspored')).toBeVisible();
    await expect(page.locator('.cut-part').first()).toBeVisible();
    await page.getByRole('button',{name:'Optimizuj ponovo'}).click();
    await expect(page.getByRole('status')).toHaveText('Optimizacija je završena i sačuvana.',{timeout:12_000});
    await page.getByRole('link',{name:'Nastavi na kalkulaciju'}).click();
    await expect(page.getByRole('heading',{level:1,name:'Kalkulacija i ponuda'})).toBeVisible();
    await page.getByRole('button',{name:'Kreiraj ponudu'}).click();
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Generiši PDF'}).click();
    expect((await download).suggestedFilename()).toMatch(/^PON-.*\.pdf$/);
  } finally {
    await context.close();
  }
});

