// Requires local Vite :5187 and Chrome CDP :9225. Diagnostic previews never write campaign saves.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const output = 'docs/v2-p2r1-p3a/screenshots';
mkdirSync(output, { recursive: true });
const cdp = 'http://127.0.0.1:9225', site = 'http://127.0.0.1:5187/v2.html';
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let serial = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Network.loadingFailed') errors.push(message.params.errorText);
  if (!message.id) return;
  const call = pending.get(message.id); pending.delete(message.id);
  message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = (await send('Runtime.evaluate', { expression, returnByValue: true })).result;
  if (response.exceptionDetails) throw Error(response.exceptionDetails.text);
  return response.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const capture = async name => writeFileSync(`${output}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const metrics = async () => {
  await evaluate(`document.querySelector('#metrics').click()`);
  const value = await evaluate(`JSON.parse(document.querySelector('#metricsText').textContent)`);
  await evaluate(`document.querySelector('#closeMetrics').click()`);
  return value;
};
const bounds = () => evaluate(`(() => {const r=document.querySelector('#arena canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const press = async (x, y, mobile, ms = 900) => {
  if (mobile) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await wait(ms / 2);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 5, y, id: 1 }] });
    await wait(ms / 2);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await wait(ms / 2);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 5, y, button: 'left', buttons: 1 });
    await wait(ms / 2);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const results = [];
for (const [width, height] of [[320, 320], [360, 640], [390, 844], [568, 320], [1280, 720], [2560, 1440]]) {
  const mobile = width < 600;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
  assert(await evaluate(`!document.querySelector('#diagnostic').hidden`));
  await evaluate(`document.querySelector('#testScenario').value='heavy';document.querySelector('#previewEnemies').click()`);
  const r = await bounds();
  assert(r.w >= 160 && r.h >= 150 && r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height);
  await capture(`heavy-${width}x${height}`);
  await press(r.x + r.w * 0.35, r.y + r.h * 0.35, mobile);
  const after = await metrics();
  assert(after.simulation.shots > 0, `${width}x${height}: fire input failed`);
  results.push({ viewport: `${width}x${height}`, arena: [r.w, r.h], shots: after.simulation.shots });
}
for (const scenario of ['single', 'cluster', 'chain']) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
  await evaluate(`document.querySelector('#testScenario').value='${scenario}';document.querySelector('#previewEnemies').click()`);
  const r = await bounds();
  await capture(`bomb-${scenario}-before-390x844`);
  await press(r.x + r.w * 0.5, r.y + r.h * 0.32, true, 1_100);
  const after = await metrics();
  assert(after.simulation.destroyed.BOMB > 0, `${scenario}: cannon did not detonate Bomb`);
  if (scenario === 'chain') assert(after.simulation.destroyed.BOMB === 3, 'Bomb chain did not resolve all three targets');
  await capture(`bomb-${scenario}-after-390x844`);
}
await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
await evaluate(`document.querySelector('#touch').value='OFFSET';document.querySelector('#touch').dispatchEvent(new Event('change'));document.querySelector('#testScenario').value='heavy';document.querySelector('#previewEnemies').click()`);
let r = await bounds();
await press(r.x + r.w * 0.35, r.y + r.h * 0.47, true);
assert((await metrics()).simulation.shots > 0, 'Offset touch did not fire');
for (const [stage, boss] of [[3, 'barbarian'], [6, 'knight'], [9, 'berserker'], [12, 'cookieng']]) {
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
  await evaluate(`document.querySelector('#preview').value='${stage}';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
  await wait(200);
  assert((await evaluate(`document.querySelector('#bossHud').textContent`)).includes('INCOMING'), `${boss}: warning missing`);
  await capture(`boss-${boss}-warning-390x844`);
  await wait(1_450);
  const snapshot = await metrics();
  assert(snapshot.simulation.boss.attacks > 0, `${boss}: no early attack`);
  await capture(`boss-${boss}-attack-390x844`);
}
await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
await evaluate(`document.querySelector('#testDamage').value='4';document.querySelector('#testRate').value='3';document.querySelector('#preview').value='3';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
r = await bounds();
const center = r.x + r.w / 2, bossY = r.y + r.h * 0.19;
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center, y: bossY, id: 1 }] });
for (let elapsed = 100; elapsed <= 6_000 && !(await evaluate(`document.querySelector('#status').textContent.includes('COMPLETE')`)); elapsed += 100) {
  await wait(100);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center + Math.sin(elapsed * 0.0008) * r.w * 0.15, y: bossY, id: 1 }] });
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert((await evaluate(`document.querySelector('#status').textContent`)).includes('COMPLETE'), 'Touch boss victory failed');
await capture('barbarian-victory-390x844');
await evaluate(`document.querySelector('#action').click()`);
assert((await evaluate(`document.querySelector('#stage').textContent`)).includes('Stage 4'));
await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(700);
await evaluate(`document.querySelector('#testHp').value='1';document.querySelector('#preview').value='3';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
for (let i = 0; i < 14 && !(await evaluate(`document.querySelector('#status').textContent.startsWith('DEFEAT')`)); i++) await wait(500);
assert((await evaluate(`document.querySelector('#status').textContent`)).includes('HEALTH'), 'Boss threat did not cause defeat');
await capture('barbarian-defeat-390x844');
await evaluate(`document.querySelector('#action').click()`);
assert((await evaluate(`document.querySelector('#action').textContent`)).includes('Start wave 1'));
await capture('barbarian-retry-390x844');

// A browser-local P2 save fixture tests purchase persistence without touching the user's profile.
await send('Page.navigate', { url: site }); await wait(700);
await evaluate(`localStorage.setItem('cookie-chaos-v2-campaign-v1', JSON.stringify({version:2,stage:1,highestCompleted:0,kingdomCompleted:false,balance:'1200',hp:5,maxHp:5,retryReference:5,repairUsed:false,damageLevel:0,fireRateLevel:0,maxHpLevel:0,seed:1207,control:'DIRECT',transactions:[],retries:0}))`);
await send('Page.navigate', { url: site }); await wait(700);
await evaluate(`document.querySelector('#closeMenu').click();document.querySelector('#shop').click()`);
assert(await evaluate(`document.querySelector('#shopDialog').open`));
await evaluate(`document.querySelector('button[data-buy="damage"]').click()`);
assert((await evaluate(`document.querySelector('#shopBalance').textContent`)).includes('1170'));
await capture('shop-purchase-390x844');
await send('Page.navigate', { url: site }); await wait(700);
await evaluate(`document.querySelector('#closeMenu').click();document.querySelector('#shop').click()`);
assert((await evaluate(`document.querySelector('#shopCards').textContent`)).includes('Damage · Lv1'));
await evaluate(`localStorage.removeItem('cookie-chaos-v2-campaign-v1')`);
await send('Page.navigate', { url: new URL('/p0.html', site).href }); await wait(650);
assert(await evaluate(`document.querySelector('canvas') !== null`));
await send('Page.navigate', { url: new URL('/', site).href }); await wait(650);
assert(await evaluate(`document.querySelector('canvas') !== null`));
assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, bombScenarios: ['single', 'cluster', 'chain'], bosses: ['barbarian', 'knight', 'berserker', 'cookieng'],
  touchDirect: true, touchOffset: true, bossVictoryDefeatRetry: true, shopReload: true, p0: true, legacy: true, errors }, null, 2));
ws.close();
