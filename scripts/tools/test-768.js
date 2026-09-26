const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const list = JSON.parse(data);
    const target = list.find(t => t.url.includes('caixa') || t.url.includes('5173')) || list[0];
    if (!target) return console.log('No tab');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => {
      // Set 1366x768
      ws.send(JSON.stringify({
        id: 1,
        method: 'Emulation.setDeviceMetricsOverride',
        params: { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }
      }));

      setTimeout(() => {
        const code = `(() => {
          const sb = document.querySelector('.status-bar');
          const app = document.querySelector('.chef-app');
          const ws = document.querySelector('.workspace');
          const prods = document.querySelector('#products-section-container');
          const table = document.querySelector('.products-table');
          const mesas = document.querySelector('#mesas-section-container');
          return {
            windowHeight: window.innerHeight,
            windowWidth: window.innerWidth,
            bodyScrollHeight: document.body.scrollHeight,
            appScrollHeight: app ? app.scrollHeight : null,
            appClientHeight: app ? app.clientHeight : null,
            statusBarRect: sb ? sb.getBoundingClientRect() : null,
            statusBarVisible: sb ? (sb.getBoundingClientRect().bottom <= window.innerHeight && sb.getBoundingClientRect().top >= 0) : false,
            workspaceRect: ws ? ws.getBoundingClientRect() : null,
            mesasRect: mesas ? mesas.getBoundingClientRect() : null,
            prodsRect: prods ? prods.getBoundingClientRect() : null,
            tableRect: table ? table.getBoundingClientRect() : null,
            overflowsBody: document.body.scrollHeight > window.innerHeight
          };
        })()`;
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: { expression: code, returnByValue: true }
        }));
      }, 500);
    });

    ws.on('message', async (m) => {
      const msg = JSON.parse(m);
      if (msg.id === 2) {
        console.log('Metrics at 1366x768:\n', JSON.stringify(msg.result.result.value, null, 2));

        // Also capture screenshot at 1366x768
        ws.send(JSON.stringify({
          id: 3,
          method: 'Page.captureScreenshot',
          params: { format: 'png' }
        }));
      } else if (msg.id === 3) {
        if (msg.result && msg.result.data) {
          const p = path.join(__dirname, 'scratch', 'screenshot-768.png');
          fs.writeFileSync(p, Buffer.from(msg.result.data, 'base64'));
          console.log('Saved screenshot-768.png');
        }
        ws.close();
        process.exit(0);
      }
    });
  });
});
