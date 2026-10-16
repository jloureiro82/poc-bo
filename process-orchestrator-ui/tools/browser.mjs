// Minimal headless-Chrome driver (Chrome DevTools Protocol over Node's built-in WebSocket) for checking the UI in a
// real browser: navigate, evaluate, click with a real mouse, drag, screenshot. No dependencies.
//
// 1. Start Chrome once (Git Bash; any free profile dir):
//      "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
//        --window-size=1600,1000 --remote-debugging-port=9333 --user-data-dir="$TMP/po-ui-chrome" about:blank &
// 2. Write a check script (see the example at the bottom; on Windows import this file as a file:/// URL)
//    and run it with:  node my-check.mjs
// 3. Stop Chrome when done (PowerShell):
//      Get-NetTCPConnection -LocalPort 9333 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
//
// Notes
// - `confirm()` dialogs (delete actions) are accepted automatically.
// - Use textContent, not innerText, in selectors' text checks: CSS text-transform changes innerText.
// - A menu or element outside the window cannot be clicked; scroll it into view first.

import { writeFileSync } from 'node:fs';

export async function connect(port = 9333) {
  const targets = await (await fetch(`http://localhost:${port}/json`)).json();
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise(resolve => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    pending.get(m.id)?.(m.result);
  });
  await send('Page.enable');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });

  const page = {
    send,
    sleep,
    /** Evaluates a JS expression in the page and returns its (JSON-serialisable) value. */
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      }
      return r.result.value;
    },
    /** Navigates to a hash route of the app, e.g. '/workflow', and waits for it to render. */
    async open(route, wait = 3000, base = 'http://localhost:4300') {
      await send('Page.navigate', { url: `${base}/#${route}` });
      await sleep(wait);
    },
    async reload(wait = 3000) {
      await send('Page.reload');
      await sleep(wait);
    },
    /** Replaces an editor's tabs (localStorage) with one tab holding `doc`, so the next load starts from it. */
    async setDraft(kind, doc) {
      const tabs = { tabs: [{ id: 'check', body: doc }], active: 'check' };
      await page.eval(`localStorage.setItem('po-ui.tabs.${kind}', ${JSON.stringify(JSON.stringify(tabs))}); true`);
    },
    /** The document in the editor's shown tab, as stored. */
    async draft(kind) {
      const tabs = JSON.parse(await page.eval(`localStorage.getItem('po-ui.tabs.${kind}')`));
      return tabs?.tabs.find(t => t.id === tabs.active)?.body ?? null;
    },
    /** Centre of the element a JS expression returns, in window coordinates. */
    async center(elementExpression) {
      const p = await page.eval(
        `(() => { const e = (${elementExpression}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
      );
      if (!p) {
        throw new Error(`element not found: ${elementExpression}`);
      }
      return p;
    },
    async hover(elementExpression) {
      const p = await page.center(elementExpression);
      await mouse('mouseMoved', p.x, p.y);
      await sleep(200);
      return p;
    },
    /** A real mouse click (hover, press, release) on the element. */
    async click(elementExpression) {
      const p = await page.center(elementExpression);
      await mouse('mouseMoved', p.x, p.y);
      await mouse('mousePressed', p.x, p.y, { clickCount: 1 });
      await mouse('mouseReleased', p.x, p.y, { clickCount: 1 });
      await sleep(350);
    },
    /** A real pointer drag between two elements (diagram ports, resize handles). Not for HTML5 drag-and-drop. */
    async drag(fromExpression, toExpression, steps = 8) {
      const a = await page.center(fromExpression);
      const b = await page.center(toExpression);
      await mouse('mouseMoved', a.x, a.y);
      await mouse('mousePressed', a.x, a.y, { clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, { buttons: 1 });
      }
      await mouse('mouseReleased', b.x, b.y, { clickCount: 1 });
      await sleep(400);
    },
    /**
     * HTML5 drag-and-drop (outline rows, workflow task boxes): dispatches dragstart/dragover/drop/dragend.
     * `fraction` is where on the target to drop vertically (0 = top edge, 1 = bottom edge).
     */
    async dragAndDrop(sourceExpression, targetExpression, fraction = 0.5) {
      return page.eval(`(() => {
        const s = (${sourceExpression}), t = (${targetExpression});
        const r = t.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height * ${fraction};
        const dt = new DataTransfer();
        s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y });
        t.dispatchEvent(over);
        t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
        s.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        return over.defaultPrevented; // false = the target refused the drop
      })()`);
    },
    /** Saves a PNG screenshot; `clip` = { x, y, width, height } to crop. */
    async screenshot(file, clip) {
      const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
    },
    close() {
      ws.close();
    },
  };
  return page;
}

/* Example (save as e.g. $TMP/check.mjs and run `node $TMP/check.mjs`):

import { connect } from 'file:///C:/DEV/projects/components/process-orchestrator-ui/tools/browser.mjs';

const page = await connect();
await page.open('/settings', 1500);
await page.setDraft('workflow', { label: 'w', tasks: [{ label: 'a', type: 'simple', component: 'logical', expression: '${true}' }] });
await page.open('/workflow');
console.log(await page.eval(`document.querySelector('.issues-head').textContent`));
await page.screenshot('C:/temp/workflow.png');
page.close();
*/
