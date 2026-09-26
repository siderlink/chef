const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const list = JSON.parse(data);
    const target = list.find(t => t.url.includes('caixa')) || list[0];
    if (!target) return console.log('No tab');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => {
      const code = `(() => {
        const sb = document.querySelector('.status-bar');
        const app = document.querySelector('.chef-app');
        const ws = document.querySelector('.workspace');
        const mesas = document.querySelector('#mesas-section-container');
        const prods = document.querySelector('#products-section-container');
        const dock = document.querySelector('.chef-colaborador-dock-btn') || document.querySelector('#chef-colaborador-dock');
        return {
          windowHeight: window.innerHeight,
          windowWidth: window.innerWidth,
          bodyScrollHeight: document.body.scrollHeight,
          appScrollHeight: app ? app.scrollHeight : null,
          appClientHeight: app ? app.clientHeight : null,
          statusBarDisplay: sb ? getComputedStyle(sb).display : null,
          statusBarTop: sb ? sb.getBoundingClientRect().top : null,
          statusBarBottom: sb ? sb.getBoundingClientRect().bottom : null,
          statusBarHeight: sb ? sb.getBoundingClientRect().height : null,
          workspaceTop: ws ? ws.getBoundingClientRect().top : null,
          workspaceBottom: ws ? ws.getBoundingClientRect().bottom : null,
          workspaceHeight: ws ? ws.getBoundingClientRect().height : null,
          workspaceDirection: ws ? getComputedStyle(ws).flexDirection : null,
          workspacePaddingBottom: ws ? getComputedStyle(ws).paddingBottom : null,
          mesasHeight: mesas ? mesas.getBoundingClientRect().height : null,
          prodsHeight: prods ? prods.getBoundingClientRect().height : null,
          dockBottom: dock ? getComputedStyle(dock).bottom : null,
          dockZIndex: dock ? getComputedStyle(dock).zIndex : null
        };
      })()`;
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: code,
          returnByValue: true
        }
      }));
    });
    ws.on('message', (m) => {
      const msg = JSON.parse(m);
      if (msg.id === 1) {
        console.log('Layout Metrics:\n', JSON.stringify(msg.result.result.value, null, 2));
        ws.close();
        process.exit(0);
      }
    });
  });
});
