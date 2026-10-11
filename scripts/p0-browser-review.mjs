// Run with Vite on :5187 and Chrome --remote-debugging-port=9225.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const site = process.env.P0_SITE ?? 'http://127.0.0.1:5187/p0.html';
const cdp = process.env.P0_CDP ?? 'http://127.0.0.1:9225';
const output = process.env.P0_SCREENSHOTS ?? 'docs/v2-p0/review-screenshots';
mkdirSync(output, { recursive: true });
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let nextId = 0;
const pending = new Map();
const errors = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const call = pending.get(message.id);
  pending.delete(message.id);
  message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = (await send('Runtime.evaluate', { expression, returnByValue: true })).result;
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const shot = async name => writeFileSync(`${output}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const dimensions = () => evaluate(`(() => { const r = document.querySelector('#arena canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, viewport:[innerWidth,innerHeight] }; })()`);
const metrics = async () => { await evaluate(`document.querySelector('#metricsButton').click()`); const result = await evaluate(`JSON.parse(document.querySelector('#metricsText').textContent)`); await evaluate(`document.querySelector('#closeMetrics').click()`); return result; };
await send('Page.enable');
await send('Runtime.enable');
const results = [];
for (const [width, height] of [[320, 320], [360, 640], [390, 844], [568, 320], [1280, 720], [2560, 1440]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 600, maxTouchPoints: 1 });
  await send('Page.navigate', { url: site });
  await wait(700);
  const rect = await dimensions();
  assert(rect.width <= 960 && rect.height <= 720 && rect.width >= 160 && rect.height >= 150);
  assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
  await evaluate(`document.querySelector('#action').click()`);
  assert.equal(await evaluate(`document.querySelector('#status').textContent`), 'Wave 1/3');
  await shot(`running-${width}x${height}`);
  const data = await metrics();
  const flightMs = Math.round((rect.height - data.config.cookieRadius * 2.85 - 1) / data.config.projectileSpeed * 1000);
  results.push({ viewport: `${width}x${height}`, arena: [rect.width, rect.height], cookieDiameter: +(2 * data.config.cookieRadius).toFixed(1), projectilePxPerSecond: Math.round(data.config.projectileSpeed), topFlightMs: flightMs });
}

async function touchDrag(mode, name) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Page.navigate', { url: site }); await wait(650);
  await evaluate(`document.querySelector('#touchSelect').value='${mode}'`);
  await evaluate(`document.querySelector('#action').click()`);
  const r = await dimensions(), y = r.y + r.height * .4;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width * .75, y, id: 1 }] });
  await wait(240); await shot(`${name}-start`);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + r.width * .25, y, id: 1 }] });
  await wait(420); await shot(`${name}-drag`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(700);
  const data = await metrics();
  assert(data.shots >= 2 && data.shots <= 3, `${mode}: firing continued after release (${data.shots} shots)`);
  assert.equal(data.phase, 'RUNNING');
  return data.shots;
}
const directShots = await touchDrag('DIRECT', 'touch-direct');
const offsetShots = await touchDrag('OFFSET', 'touch-offset');

// Chrome Device Toolbar can synthesize touch from a mouse drag.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await send('Page.navigate', { url: site }); await wait(650);
await evaluate(`document.querySelector('#action').click()`);
const emulatedRect = await dimensions();
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: emulatedRect.x + emulatedRect.width * .75, y: emulatedRect.y + emulatedRect.height * .4, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: emulatedRect.x + emulatedRect.width * .25, y: emulatedRect.y + emulatedRect.height * .4, button: 'left', buttons: 1 });
await wait(450); await shot('device-toolbar-mouse-drag-390x844');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: emulatedRect.x + emulatedRect.width * .25, y: emulatedRect.y + emulatedRect.height * .4, button: 'left', clickCount: 1 });
const emulatedMouseShots = (await metrics()).shots;
assert(emulatedMouseShots > 0, 'Mouse drag with mobile emulation must fire');

await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 320, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await send('Page.navigate', { url: site }); await wait(650);
await evaluate(`document.querySelector('#action').click()`);
for (let i = 0; i < 50 && await evaluate(`document.querySelector('#status').textContent.startsWith('DEFEAT')`) === false; i++) await wait(400);
assert(await evaluate(`document.querySelector('#status').textContent.startsWith('DEFEAT')`), 'Expected defeat from unattended first wave');
const before = await metrics();
const r = await dimensions();
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width * .7, y: r.y + r.height * .4, id: 2 }] });
await wait(450);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert.equal((await metrics()).shots, before.shots, 'Terminal state must not fire');
await evaluate(`document.querySelector('#action').click()`);
assert(await evaluate(`document.querySelector('#action').textContent.includes('Start wave 1')`));
await evaluate(`document.querySelector('#action').click()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width * .7, y: r.y + r.height * .4, id: 3 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + r.width * .3, y: r.y + r.height * .4, id: 3 }] });
await wait(450); await shot('retry-touch-drag-320x320');
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const after = await metrics();
assert(after.shots > before.shots, 'Touch must fire after Retry and Start Wave');

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Page.navigate', { url: site }); await wait(650);
await evaluate(`document.querySelector('#action').click()`);
const mouseRect = await dimensions();
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouseRect.x + mouseRect.width * .75, y: mouseRect.y + mouseRect.height * .35, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouseRect.x + mouseRect.width * .25, y: mouseRect.y + mouseRect.height * .35, button: 'left', buttons: 1 });
await wait(450); await shot('mouse-drag-1280x720');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouseRect.x + mouseRect.width * .25, y: mouseRect.y + mouseRect.height * .35, button: 'left', clickCount: 1 });
assert((await metrics()).shots > 0, 'Mouse drag must fire');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await wait(300);
const resizedRect = await dimensions();
assert.equal(resizedRect.width, 390);
assert.equal(resizedRect.height, 664);
await shot('live-resize-desktop-to-mobile');
assert.equal((await metrics()).config.cookieRadius, 19);
assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, directShots, offsetShots, emulatedMouseShots, retryShots: after.shots, errors }, null, 2));
socket.close();
