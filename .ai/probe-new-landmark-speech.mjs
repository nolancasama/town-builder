import { createRequire } from 'node:module';
const { chromium } = createRequire('C:/Users/nolan/ui-verify/')('playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4191/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);
const out = await page.evaluate(async () => {
  const { LANDMARKS, ALL_TYPES } = await import('/src/config/landmarks.js');
  const { matchSentence, matchAction } = await import('/src/systems/speech.js');
  const { DEFAULT_UNLOCKED } = await import('/src/config/progression.js');
  const build = {
    hairSalon: ['We have a hair salon in Matsubara.', 'we have a barber in matsubara', 'we have a restaurant in matsubara'],
    vet: ['We have a vet clinic in Matsubara.', 'we have a bet clinic in matsubara'],
    florist: ['We have a flower shop in Matsubara.', 'we have a flour shop in matsubara'],
    sushiRestaurant: ['We have a sushi restaurant in Matsubara.', 'we have a restaurant in matsubara'],
  };
  const tour = {
    hairSalon: ['we can get a haircut in the hair salon', 'we can get a hair cut', 'we can wash my hair', 'we can eat sushi'],
    vet: ['we can help animals in the vet clinic', 'we can see dogs', 'we can take care of pets', 'we can see a cat', 'we can take my cat', 'we can see a vet', 'we can see a lion', 'we can swim'],
    florist: ['we can buy flowers in the flower shop', 'we can smell the flowers', 'we can buy a bouquet'],
    sushiRestaurant: ['we can eat sushi in the sushi restaurant', 'we can have dinner', 'we can eat fish', 'we can buy flowers', 'we can swim at the sushi restaurant', 'we can eat'], restaurant: ['we can swim at the restaurant'],
  };
  const r = { pool: ALL_TYPES.length, lockedNew: ['hairSalon','vet','florist','sushiRestaurant'].filter((t) => !DEFAULT_UNLOCKED.includes(t)).length };
  for (const [t, ss] of Object.entries(build)) for (const s of ss) {
    const m = matchSentence(s, LANDMARKS[t]); r[`BUILD ${t}: ${s}`] = m.ok !== undefined ? m.ok : JSON.stringify(m);
  }
  for (const [t, ss] of Object.entries(tour)) for (const s of ss) {
    const m = matchAction(s, LANDMARKS[t]); r[`TOUR ${t}: ${s}`] = `${m.ok} ${m.action ? m.action.id + '/' + m.action.anim : '-'}`;
  }
  return r;
});
for (const [k, v] of Object.entries(out)) console.log(String(v).padEnd(18), k);
await browser.close();
