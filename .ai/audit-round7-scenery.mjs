import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 4191;
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('assets/buildings/')) errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

const result = await page.evaluate(async () => {
  const { Box3 } = await import('/node_modules/.vite/deps/three.js');
  const scenery = window.game.scene.getObjectByName('scenery');
  const buildings = scenery?.children[0];
  const graph = window.game.world.graph;
  const lots = [...window.game.world.dressings.values()].map(({ lot }) => ({
    id: lot.id,
    x: lot.pos[0],
    z: lot.pos[1],
    w: lot.size[0],
    d: lot.size[1],
  }));
  const buildingRows = (buildings?.children || []).map((building) => {
    const box = new Box3().setFromObject(building);
    const roadEdgeDistance = graph.distanceToRoad(building.position.x, building.position.z);
    let lotGap = Infinity;
    let nearestLot = null;
    for (const lot of lots) {
      const dx = Math.max(0, Math.abs(building.position.x - lot.x) - lot.w / 2);
      const dz = Math.max(0, Math.abs(building.position.z - lot.z) - lot.d / 2);
      const gap = Math.hypot(dx, dz);
      if (gap < lotGap) { lotGap = gap; nearestLot = lot.id; }
    }
    return {
      x: Number(building.position.x.toFixed(3)),
      z: Number(building.position.z.toFixed(3)),
      xz: [Number((box.max.x - box.min.x).toFixed(3)), Number((box.max.z - box.min.z).toFixed(3))],
      roadEdgeDistance: Number(roadEdgeDistance.toFixed(3)),
      nearestLot,
      centerToLotEdge: Number(lotGap.toFixed(3)),
    };
  });
  return {
    housesAndShops: buildings?.children.length || 0,
    roadSegments: graph.edges.length,
    nodes: graph.nodes.length,
    sceneryStats: window.game.world.sceneryStats,
    buildings: buildingRows,
  };
});

console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
