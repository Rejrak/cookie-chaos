// Start Vite on :5187 and Chrome with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const site = process.env.V2_SITE ?? 'http://127.0.0.1:5187/v2.html';
const cdp = process.env.V2_CDP ?? 'http://127.0.0.1:9225';
const output = process.env.V2_SCREENSHOTS ?? 'docs/v2-p1/screenshots';
mkdirSync(output, { recursive: true });
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let id = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const call = pending.get(message.id); pending.delete(message.id);
  message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
});
const evalJs = async expression => {
  const result = (await send('Runtime.evaluate', { expression, returnByValue: true })).result;
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const screenshot = async name => writeFileSync(`${output}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const arena = () => evalJs(`(() => {const r=document.querySelector('#arena canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
const metrics = async () => { await evalJs(`document.querySelector('#metrics').click()`); const data = await evalJs(`JSON.parse(document.querySelector('#metricsText').textContent)`); await evalJs(`document.querySelector('#closeMetrics').click()`); return data; };
await send('Page.enable'); await send('Runtime.enable');
const results = [];
for (const [width, height] of [[320, 320], [360, 640], [390, 844], [568, 320], [1280, 720], [2560, 1440]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 600, maxTouchPoints: 1 });
  await send('Page.navigate', { url: site }); await wait(600);
  await evalJs(`localStorage.removeItem('cookie-chaos-v2-campaign-v1')`);
  await send('Page.reload'); await wait(500);
  assert(await evalJs(`document.querySelector('#menuDialog').open`));
  await screenshot(`menu-${width}x${height}`);
  await evalJs(`document.querySelector('#closeMenu').click()`);
  const rect = await arena();
  assert(rect.width >= 160 && rect.height >= 150 && rect.width <= 960 && rect.height <= 720);
  assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
  await evalJs(`document.querySelector('#shop').click()`);
  assert(await evalJs(`document.querySelector('#shopDialog').open`));
  assert(await evalJs(`document.querySelectorAll('#shopCards .shop-card').length`) === 4);
  await screenshot(`shop-${width}x${height}`);
  await evalJs(`document.querySelector('#closeShop').click()`);
  await evalJs(`document.querySelector('#action').click()`);
  assert((await evalJs(`document.querySelector('#status').textContent`)).includes('Wave 1/3'));
  assert(await evalJs(`document.querySelector('#shop').disabled`));
  await screenshot(`running-${width}x${height}`);
  results.push({ viewport: `${width}x${height}`, arena: [rect.width, rect.height] });
}

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await send('Page.navigate', { url: site }); await wait(600);
await evalJs(`document.querySelector('#touch').value='OFFSET';document.querySelector('#touch').dispatchEvent(new Event('change'));document.querySelector('#closeMenu').click();document.querySelector('#action').click()`);
const touchRect = await arena(), touchY = touchRect.y + touchRect.height * .4;
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchRect.x + touchRect.width * .75, y: touchY, id: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchRect.x + touchRect.width * .25, y: touchY, id: 1 }] });
await wait(550); await screenshot('touch-offset-drag');
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const touchShots = (await metrics()).simulation.shots;
assert(touchShots > 0);

await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 320, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: site }); await wait(600);
await evalJs(`localStorage.removeItem('cookie-chaos-v2-campaign-v1')`);
await send('Page.reload'); await wait(500);
await evalJs(`document.querySelector('#closeMenu').click();document.querySelector('#action').click()`);
for (let i = 0; i < 60 && !(await evalJs(`document.querySelector('#status').textContent.startsWith('DEFEAT')`)); i++) await wait(400);
assert(await evalJs(`document.querySelector('#status').textContent.startsWith('DEFEAT')`));
await screenshot('defeat-320x320');
await evalJs(`document.querySelector('#shop').click()`);
assert(await evalJs(`document.querySelector('#shopDialog').open`));
await evalJs(`document.querySelector('#closeShop').click();document.querySelector('#action').click()`);
assert((await evalJs(`document.querySelector('#action').textContent`)).includes('Start wave 1'));
await screenshot('retry-prep-320x320');

await send('Page.navigate', { url: site }); await wait(600);
const saved = await evalJs(`localStorage.getItem('cookie-chaos-v2-campaign-v1')`);
const seeded = { ...JSON.parse(saved ?? '{}'), version: 1, stage: 1, highestCompleted: 0, balance: '100',
  hp: 5, maxHp: 5, retryReference: 5, repairUsed: false, damageLevel: 0, fireRateLevel: 0, maxHpLevel: 0,
  seed: 1207, control: 'DIRECT', transactions: [], retries: 0 };
await evalJs(`localStorage.setItem('cookie-chaos-v2-campaign-v1', ${JSON.stringify(JSON.stringify(seeded))})`);
await send('Page.reload'); await wait(600);
await evalJs(`document.querySelector('#closeMenu').click();document.querySelector('#shop').click()`);
await evalJs(`document.querySelector('[data-buy=damage]').click()`);
assert((await evalJs(`document.querySelector('#shopBalance').textContent`)).includes('80 consolidated'));
await screenshot('shop-purchase-390x844');
await send('Page.reload'); await wait(600);
assert((await evalJs(`document.querySelector('#shopBalance').textContent`)).includes('80 consolidated') === false); // Shop starts closed.
await evalJs(`document.querySelector('#closeMenu').click();document.querySelector('#shop').click()`);
assert((await evalJs(`document.querySelector('#shopBalance').textContent`)).includes('80 consolidated'));
assert((await evalJs(`document.querySelector('#shopCards').textContent`)).includes('Damage · Lv1'));

await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(600);
assert(await evalJs(`!document.querySelector('#diagnostic').hidden`));
await evalJs(`document.querySelector('#preview').value='4';document.querySelector('#preview').dispatchEvent(new Event('change'));document.querySelector('#closeMenu').click()`);
assert((await evalJs(`document.querySelector('#stage').textContent`)).includes('Stage 4'));
await evalJs(`document.querySelector('#action').click()`); await screenshot('stage-4-preview');
await send('Page.navigate', { url: new URL('/', site).href }); await wait(750);
assert(await evalJs(`document.querySelector('canvas') !== null`), 'M10 clicker must remain available');
await screenshot('legacy-clicker-390x844');
assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, touchShots, purchasePersisted: true, diagnosticStage4: true, legacyClicker: true, errors }, null, 2));
ws.close();
