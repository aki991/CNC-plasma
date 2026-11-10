import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseDxf } from '../../src/geometry/dxf';

test('Voronoi menja meru panela, čuva varijantu i izvozi DXF koji se ponovo uvozi',async({page})=>{
  await page.goto('/projektovanje-ograda');
  await page.getByRole('button',{name:'Novi projekat',exact:true}).click();
  await page.getByRole('button',{name:'DXF biblioteka',exact:true}).click();
  await page.getByRole('button',{name:'Voronoi ispuna',exact:true}).click();
  const inspector=page.locator('.fence-inspector');
  const metal=page.locator('.fence-metal');
  await inspector.getByRole('spinbutton',{name:'Svetla širina (mm)',exact:true}).fill('2020');
  await inspector.getByRole('spinbutton',{name:'Visina (mm)',exact:true}).fill('1080');
  await expect(inspector).toContainText('2.000 mm × 1.000 mm');
  await expect(inspector.getByRole('spinbutton',{name:'Broj otvora'})).toHaveValue('68');
  const initial=await metal.getAttribute('d');
  expect(initial!.match(/Z/g)).toHaveLength(69);

  await inspector.getByRole('spinbutton',{name:'Svetla širina (mm)',exact:true}).fill('1800');
  await inspector.getByRole('spinbutton',{name:'Visina (mm)',exact:true}).fill('1200');
  await inspector.getByRole('spinbutton',{name:'Širina rama (mm)',exact:true}).fill('35');
  await inspector.getByRole('spinbutton',{name:'Minimalna širina lima (mm)',exact:true}).fill('14');
  await inspector.getByRole('spinbutton',{name:'Zaobljenje (%)',exact:true}).fill('60');
  await expect(inspector).toContainText('1.780 mm × 1.120 mm');
  await expect(metal).not.toHaveAttribute('d',initial!);
  const beforeVariant=await metal.getAttribute('d');
  await page.getByRole('button',{name:'Nova varijanta',exact:true}).click();
  await expect(metal).not.toHaveAttribute('d',beforeVariant!);
  const variant=await metal.getAttribute('d');
  expect(variant!.match(/Z/g)).toHaveLength(69);
  await expect(page.locator('.fence-projectbar [role=status]')).toHaveText('Automatski sačuvano');
  const projectUrl=page.url();
  await page.reload();
  await expect(metal).toHaveAttribute('d',variant!);
  await page.getByRole('button',{name:'Segment 1 · prikaz',exact:true}).click();
  await expect(inspector.getByRole('spinbutton',{name:'Širina rama (mm)',exact:true})).toHaveValue('35');
  await expect(inspector.getByRole('spinbutton',{name:'Minimalna širina lima (mm)',exact:true})).toHaveValue('14');
  await expect(inspector.getByRole('spinbutton',{name:'Zaobljenje (%)',exact:true})).toHaveValue('60');
  await expect(inspector.getByRole('spinbutton',{name:'Broj otvora'})).toHaveValue('68');

  await page.getByRole('button',{name:'Generiši DXF za sečenje'}).click();
  const row=page.locator('.fence-result tbody tr');
  await expect(row).toContainText('1.780 mm × 1.120 mm');
  const downloaded=page.waitForEvent('download');
  await row.getByRole('button',{name:/Preuzmi .*\.dxf/}).click();
  const buffer=await readFile((await (await downloaded).path())!);
  const parsed=parseDxf(buffer.toString('utf8'));
  expect(parsed).toMatchObject({valid:true,unit:4,shape:{width:1780,height:1120}});
  expect(parsed.shape.depths).toEqual([0,...Array(68).fill(1)]);
  await page.getByRole('button',{name:'Zatvori obaveštenje'}).click();
  await page.locator('.workspace').evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:'test-results/screenshots/1920x1080/08-voronoi-1780x1120.png',animations:'disabled'});

  await page.goto('/dxf');
  await page.getByLabel('Uvoz u biblioteku').setInputFiles({name:'voronoi-provera.dxf',mimeType:'application/dxf',buffer});
  await page.getByRole('link',{name:'voronoi-provera',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('1.780,00 × 1.120,00 mm');
  await expect(page.getByRole('dialog')).toContainText('69 kontura');

  await page.goto(projectUrl);
  await page.getByRole('button',{name:'Segment 1 · prikaz',exact:true}).click();
  await inspector.getByRole('spinbutton',{name:'Svetla širina (mm)',exact:true}).fill('2000');
  await inspector.getByRole('button',{name:'Voronoi ispuna · Promeni',exact:true}).click();
  await page.getByLabel('Pretraži šablone').fill('voronoi-provera');
  await page.getByRole('dialog').getByRole('button',{name:/voronoi-provera/}).click();
  await expect(inspector.getByRole('combobox',{name:'Režim šablona'})).toHaveValue('repeat');
  await expect(inspector).toContainText('Mera lima za sečenje1.980 mm × 1.120 mm');
  await expect(inspector).toContainText('Širina između stubova 2.000 mm umanjena je za 20 mm.');
  const copiedPattern=await metal.getAttribute('d');
  await inspector.getByRole('button',{name:'Prebaci na Voronoi',exact:true}).click();
  await expect(inspector.getByRole('button',{name:'Voronoi ispuna · Promeni',exact:true})).toBeVisible();
  await expect(inspector.getByRole('spinbutton',{name:'Svetla širina (mm)',exact:true})).toHaveValue('2000');
  await expect(inspector).toContainText('Mera lima za sečenje1.980 mm × 1.120 mm');
  await expect(metal).not.toHaveAttribute('d',copiedPattern!);

  await inspector.getByRole('spinbutton',{name:'Širina rama (mm)',exact:true}).fill('600');
  await expect(page.locator('.fence-problems')).toContainText('Ram je preširok');
  await expect(row).toHaveCount(0);
  await page.getByRole('button',{name:'Generiši DXF za sečenje'}).click();
  await expect(page.getByRole('alert')).toContainText('Ram je preširok');

  await inspector.getByRole('spinbutton',{name:'Širina rama (mm)',exact:true}).fill('30');
  await inspector.getByRole('spinbutton',{name:'Svetla širina (mm)',exact:true}).fill('120');
  await inspector.getByRole('spinbutton',{name:'Visina (mm)',exact:true}).fill('180');
  await inspector.getByRole('spinbutton',{name:'Broj otvora',exact:true}).fill('200');
  await expect(page.locator('.fence-problems')).toContainText('otvora je premalo ili neispravno');
  await expect(row).toHaveCount(0);
});

