import { chromium } from 'playwright';
const b = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport:{width:1366,height:768} });
await p.goto('http://127.0.0.1:4198/?dev=1&skipIntro=1&target=30',{waitUntil:'domcontentloaded'});
await p.locator('#name-form button').click();
await p.locator('#choice-panel:not(.hidden)').waitFor({timeout:30000});
const wait=async w=>p.waitForFunction(x=>window.game&&window.game.phase===x,w,{timeout:60000});
await wait('choosing'); await p.keyboard.press('Shift+B'); await wait('ready'); await p.keyboard.press('Shift+B');
await wait('choosing'); await p.waitForTimeout(1500);
console.log(await p.evaluate(()=>({
  built: window.game.built,
  takenLots: window.game.takenLots instanceof Map
    ? [...window.game.takenLots.entries()].map(([k,v])=>[k, v && v.name ? v.name : String(v)])
    : window.game.takenLots,
  landmarksIsMap: window.game.landmarks instanceof Map,
  entryShape: (()=>{const e=window.game.landmarks.get('park');
    if(!e) return null;
    return { keys:Object.keys(e), hasLot:!!e.lot, lotKeys:e.lot?Object.keys(e.lot):null,
             isObject3D: !!e.isObject3D, pos: e.position?[e.position.x,e.position.z]:null };})(),
})));
await b.close();
