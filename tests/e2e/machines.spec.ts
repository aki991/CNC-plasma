import { expect, test } from '@playwright/test';

const captures = 'test-results/screenshots/machines/';

test('Simulacija menja status i napredak, čuva alarm i povezuje postojeći nalog',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'CNC mašine',exact:true}).click();
  const cards = page.locator('.machine-live-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('OGRADA_PETROVIC_TABLA_01.nc');
  await expect(cards.last()).toContainText('PANELI_JOVANOVIC_02.ngc');
  await page.getByRole('button',{name:'Resetuj simulaciju',exact:true}).click();
  await page.getByRole('button',{name:'Potvrdi resetovanje'}).click();
  await expect(cards.first()).toContainText('Čeka posao');
  await page.getByRole('button',{name:'Pokreni simulaciju',exact:true}).click();
  await expect(cards.first()).toContainText('U radu');
  await page.getByRole('button',{name:'Ubrzaj vreme 20×'}).click();
  await expect.poll(async()=>Number(await cards.first().getByRole('progressbar').getAttribute('value'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pauziraj simulaciju'}).click();
  const progress = await cards.first().getByRole('progressbar').getAttribute('value');
  await page.reload();
  await expect(cards.first().getByRole('progressbar')).toHaveAttribute('value',progress!);
  await page.getByRole('button',{name:'Nastavi simulaciju'}).click();
  await page.getByRole('button',{name:'Simuliraj alarm'}).click();
  await expect(cards.first().locator('.machine-status')).toHaveText('Alarm');
  await page.getByRole('button',{name:'Unesi razlog'}).first().click();
  await page.getByRole('combobox',{name:'Razlog zastoja'}).selectOption('Kvar');
  await page.getByRole('textbox',{name:'Napomena'}).fill('Provera senzora');
  await page.getByRole('button',{name:'Sačuvaj razlog'}).click();
  await expect(page.locator('.machine-alarm').first()).toContainText('Kvar');
  await page.getByRole('button',{name:'Otkloni alarm'}).click();
  await page.getByRole('button',{name:'Simuliraj prekid veze'}).click();
  await expect(cards.first().locator('.machine-status')).toHaveText('Offline');
  await page.getByRole('button',{name:'Ponovo poveži'}).click();
  await expect(cards.first().locator('.machine-status')).toHaveText('U radu');
  await page.getByRole('button',{name:'Pauziraj simulaciju'}).click();
  await page.getByRole('button',{name:'Završi program'}).click();
  await expect(cards.first().getByRole('progressbar')).toHaveAttribute('value','100');
  await cards.first().getByRole('link',{name:'Detalji mašine'}).click();
  await expect(page.getByRole('heading',{name:'CNC plazma 01',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Sačuvani nesting raspored'})).toBeVisible();
  await page.getByRole('button',{name:'Potvrdi ciklus',exact:true}).click();
  await expect(page.locator('.machine-confirm')).toContainText('Potvrdio');
  await expect(page.locator('.machine-alarm').filter({hasText:'Nizak pritisak gasa'})).toContainText('Kvar');
  await page.getByRole('link',{name:'Kalkulacija',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Izvršavanje CNC programa'})).toBeVisible();
  await page.goBack();
  await page.getByRole('link',{name:'Otvori radni nalog',exact:true}).click();
  await expect(page).toHaveURL(/\/proizvodnja\/P-1058$/);
  await expect(page.getByText('Ograda Petrović',{exact:false}).first()).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveValue('Spremno za sečenje');
});

test('Izveštaji po periodu, detalji obe mašine i snimci desktop prikaza',async({page})=>{
  await page.goto('/machines');
  await expect(page.locator('.machine-live-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Pauziraj simulaciju'}).click();
  await page.screenshot({path:captures+'01-pregled.png',animations:'disabled'});
  await page.setViewportSize({width:1920,height:1500});
  const statistics = page.getByRole('region',{name:'Statistika CNC mašina'});
  for (const [label,name] of [['Danas','04-danas'],['7 dana','05-nedelja'],['Mesec','06-mesec'],['Godina','07-godina']]) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(statistics.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await statistics.screenshot({path:captures+name+'.png',animations:'disabled'});
  }
  await page.getByRole('button',{name:'Prilagođeno',exact:true}).click();
  await page.getByRole('button',{name:'Prethodni mesec'}).click();
  const lastMonth = await page.getByLabel('Od datuma').inputValue();
  await page.getByRole('button',{name:'Poslednjih 12 meseci'}).click();
  await expect(page.getByLabel('Od datuma')).not.toHaveValue(lastMonth);
  const alarms = page.locator('.machine-alarms');
  await expect(alarms.locator('.machine-alarm').first()).toBeVisible();
  await alarms.screenshot({path:captures+'08-alarmi.png',animations:'disabled'});
  await page.setViewportSize({width:1920,height:1080});
  for (const [index,id] of ['plasma-01','plasma-02'].entries()) {
    await page.goto('/machines/'+id);
    await expect(page.getByRole('heading',{name:'CNC plazma 0'+(index+1),exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Vremenska linija smene'})).toBeVisible();
    await page.getByRole('combobox',{name:'Smena'}).selectOption('day');
    const period = page.getByRole('group',{name:'Vremenska linija statusa'});
    await expect(period.getByRole('button').first()).toBeAttached();
    await page.locator('.workspace').evaluate(element=>{element.scrollTop=0;});
    await page.screenshot({path:captures+'0'+(index+2)+'-detalji.png',animations:'disabled'});
    await page.locator('.machine-events button').first().click();
    await expect(page.getByRole('dialog')).toContainText('Početak');
    await page.getByRole('button',{name:'Zatvori',exact:true}).click();
  }
});

test('Pregled i statistika staju u prikaz telefona i tableta',async({page})=>{
  for (const [width,height] of [[390,844],[820,1180]]) {
    await page.setViewportSize({width,height});
    await page.goto('/machines');
    await expect(page.getByRole('heading',{name:'CNC mašine',exact:true})).toBeVisible();
    await expect(page.locator('.machine-live-card')).toHaveCount(2);
    const fits = (element: Element) => element.scrollWidth <= element.clientWidth + 1;
    const workspace = page.locator('.workspace');
    expect(await workspace.evaluate(fits)).toBe(true);
    if(width===390) await page.screenshot({path:captures+'09-mobilni.png',animations:'disabled'});
    await page.mouse.move(width-40,height-70);
    await page.mouse.wheel(0,550);
    await expect.poll(()=>workspace.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole('button',{name:'7 dana',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Iskorišćenost mašine'})).toBeVisible();
    expect(await workspace.evaluate(fits)).toBe(true);
  }
});
