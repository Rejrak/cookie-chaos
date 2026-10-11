// Requires Vite :5187 and Chrome CDP :9225. Uses diagnostic previews; never writes campaign saves.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const site = process.env.V2_SITE ?? 'http://127.0.0.1:5187/v2.html';
const cdp = process.env.V2_CDP ?? 'http://127.0.0.1:9225';
const output = process.env.V2_SCREENSHOTS ?? 'docs/v2-p2/screenshots';
mkdirSync(output, { recursive: true });
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
  const result = (await send('Runtime.evaluate', { expression, returnByValue: true })).result;
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const capture = async name => writeFileSync(`${output}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const rect = () => evaluate(`(() => {const r=document.querySelector('#arena canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const bossMetrics = async () => {
  await evaluate(`document.querySelector('#metrics').click()`);
  const value = await evaluate(`JSON.parse(document.querySelector('#metricsText').textContent).simulation`);
  await evaluate(`document.querySelector('#closeMetrics').click()`);
  return value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const results = [];
for (const [width, height] of [[320, 320], [360, 640], [390, 844], [568, 320], [1280, 720], [2560, 1440]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 600, maxTouchPoints: 1 });
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(750);
  assert(await evaluate(`!document.querySelector('#diagnostic').hidden`));
  await evaluate(`document.querySelector('#preview').value='3';document.querySelector('#previewBoss').click()`);
  assert((await evaluate(`document.querySelector('#status').textContent`)).includes('prepare and start'));
  const bounds = await rect();
  assert(bounds.w >= 160 && bounds.h >= 150 && bounds.x >= 0 && bounds.y >= 0);
  assert(bounds.x + bounds.w <= width && bounds.y + bounds.h <= height, `${width}x${height}: canvas outside viewport`);
  await capture(`barbarian-intro-${width}x${height}`);
  await evaluate(`document.querySelector('#shop').click()`);
  assert(await evaluate(`document.querySelector('#shopDialog').open`));
  await capture(`boss-shop-${width}x${height}`);
  await evaluate(`document.querySelector('#closeShop').click();document.querySelector('#action').click()`);
  assert(await evaluate(`document.querySelector('#shop').disabled`));
  const x = bounds.x + bounds.w / 2, y = bounds.y + Math.max(28, bounds.h * 0.19);
  if (width < 600) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await wait(350);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 8, y: y + 8, id: 1 }] });
    await wait(350);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await wait(350);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 8, y: y + 8, button: 'left', buttons: 1 });
    await wait(350);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }
  const metrics = await bossMetrics();
  assert(metrics.shots > 0, `${width}x${height}: pointer did not fire`);
  assert(metrics.boss.damageDealt > 0 || metrics.boss.blocked > 0, `${width}x${height}: pointer did not hit boss`);
  await capture(`barbarian-fight-${width}x${height}`);
  results.push({ viewport: `${width}x${height}`, arena: [bounds.w, bounds.h], shots: metrics.shots,
    damage: metrics.boss.damageDealt, blocked: metrics.boss.blocked });
}
for (const [stage, name] of [[6, 'knight'], [9, 'berserker'], [12, 'cookieng']]) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(750);
  await evaluate(`document.querySelector('#preview').value='${stage}';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
  await wait(3_000);
  assert((await evaluate(`document.querySelector('#bossHud').textContent`)).includes('INCOMING'));
  await capture(`${name}-warning-390x844`);
  await wait(1_300);
  const metrics = await bossMetrics();
  assert(metrics.boss.attacks > 0);
  await capture(`${name}-threats-390x844`);
  if (stage === 6) {
    const r = await rect(), x = r.x + r.w / 2 - 12, y = r.y + r.h * 0.19;
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await wait(650);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await bossMetrics();
    assert(after.boss.blocked > 0 && after.boss.hp === 20, 'Knight shield did not absorb touch shots');
    await capture('knight-shield-hit-390x844');
  }
}
for (const [stage, name, speed, amplitude, expectedPhase] of [[9, 'berserker', .0014, .2, 'RAGE'], [12, 'cookieng', .0008, .15, 'GOLDEN FORM']]) {
  await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(750);
  await evaluate(`document.querySelector('#testDamage').value='2';document.querySelector('#preview').value='${stage}';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
  const r = await rect(), center = r.x + r.w / 2, y = r.y + r.h * .19;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center, y, id: 1 }] });
  for (let elapsed = 100; elapsed <= 2_100; elapsed += 100) {
    await wait(100);
    const x = center + Math.sin(elapsed * speed) * r.w * amplitude;
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const phase = (await bossMetrics()).boss.phase;
  assert(phase === expectedPhase, `${name}: expected ${expectedPhase}, got ${phase}`);
  await capture(`${name}-phase-390x844`);
}
await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(750);
await evaluate(`document.querySelector('#testDamage').value='4';document.querySelector('#testRate').value='3';document.querySelector('#preview').value='3';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
const winRect = await rect(), winX = winRect.x + winRect.w / 2, winY = winRect.y + winRect.h * 0.19;
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: winX, y: winY, id: 1 }] });
await wait(1_200);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert((await evaluate(`document.querySelector('#status').textContent`)).includes('COMPLETE'), 'Real touch fire did not defeat the boss');
await capture('barbarian-victory-390x844');
await evaluate(`document.querySelector('#action').click()`);
assert((await evaluate(`document.querySelector('#stage').textContent`)).includes('Stage 4'));

await send('Page.navigate', { url: `${site}?diagnostic=1` }); await wait(750);
await evaluate(`document.querySelector('#testHp').value='1';document.querySelector('#preview').value='3';document.querySelector('#previewBoss').click();document.querySelector('#action').click()`);
for (let i = 0; i < 24 && !(await evaluate(`document.querySelector('#status').textContent.startsWith('DEFEAT')`)); i++) await wait(500);
assert((await evaluate(`document.querySelector('#status').textContent`)).includes('HEALTH'));
await capture('barbarian-defeat-390x844');
await evaluate(`document.querySelector('#action').click()`);
assert((await evaluate(`document.querySelector('#action').textContent`)).includes('Start wave 1'));
await capture('barbarian-retry-390x844');

await send('Page.navigate', { url: new URL('/p0.html', site).href }); await wait(700);
assert(await evaluate(`document.querySelector('canvas') !== null`));
await send('Page.navigate', { url: new URL('/', site).href }); await wait(700);
assert(await evaluate(`document.querySelector('canvas') !== null`));
assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, bossWarnings: ['knight', 'berserker', 'cookieng'], knightShield: true,
  advancedPhases: ['RAGE', 'GOLDEN FORM'], browserVictory: true, browserDefeatRetry: true, p0: true, legacy: true, errors }, null, 2));
ws.close();
