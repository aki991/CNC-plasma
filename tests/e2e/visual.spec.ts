import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const screens = [
  ['01-dashboard','/','Kontrolna tabla'], ['02-novi-posao','/poslovi/novi','Novi posao'], ['03-nesting','/nesting','Nesting'],
  ['04-kalkulacija','/kalkulacije','Kalkulacija i ponuda'], ['05-proizvodnja','/proizvodnja','Proizvodnja'],
];
for (const [width,height] of [[1920,1080],[1440,900],[1366,768],[2560,1440],[1448,1086]]) {
  test('Ključni ekrani '+width+' × '+height, async ({page})=>{
    await page.setViewportSize({width,height});
    const dir=resolve('test-results/screenshots/'+width+'x'+height);
    await mkdir(dir,{recursive:true});
    for(const [name,url,title] of screens){
      await page.goto(url);
      await expect(page.getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();
      if(url==='/poslovi/novi'){
        await page.getByLabel('Naziv posla').fill('Ograda Petrović – paneli i kapija');
        await page.getByLabel('Kupac',{exact:false}).selectOption({label:'Petrović d.o.o.'});
        await page.getByLabel('Napomena').fill('Paneli ograde, dekorativna kapija i nosači.');
        await page.getByLabel('Uvoz DXF fajlova').setInputFiles(['public/models/og-005.dxf','public/models/og-015.dxf','public/models/og-019.dxf']);
        await expect(page.getByRole('heading',{name:'Uvezeni DXF fajlovi (3)'})).toBeVisible();
        await page.getByLabel('Količina og-005.dxf').fill('10');
        await page.getByLabel('Količina og-019.dxf').fill('8');
        await page.getByRole('button',{name:'Zatvori obaveštenje'}).click();
      }
      await page.evaluate(()=>document.fonts.ready);
      const widthFits=await page.locator('.workspace').evaluate(element=>element.scrollWidth<=element.clientWidth+1);
      expect(widthFits,url+' horizontalni skrol').toBe(true);
      await page.screenshot({path:dir+'/'+name+'.png',animations:'disabled'});
    }
  });
}

