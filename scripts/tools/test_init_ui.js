const fs = require('fs');
let js = fs.readFileSync('super-admin.js', 'utf8');

const elementMap = new Map();
function getMockElement(id) {
  if (!elementMap.has(id)) {
    elementMap.set(id, {
      id: id,
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      },
      addEventListener: (evt, fn) => {},
      removeEventListener: () => {},
      appendChild: () => {},
      querySelector: () => getMockElement(id + '-child'),
      querySelectorAll: () => [],
      value: '',
      checked: false,
      innerHTML: '',
      innerText: '',
      textContent: '',
      setAttribute: () => {},
      getAttribute: () => null,
      closest: (sel) => getMockElement(id + '-closest'),
      remove: () => {}
    });
  }
  return elementMap.get(id);
}

const mockDoc = {
  getElementById: (id) => getMockElement(id),
  querySelector: (sel) => getMockElement('sel-' + sel),
  querySelectorAll: (sel) => [getMockElement('mock-el-1'), getMockElement('mock-el-2')],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => getMockElement('tag-' + tag),
  body: { style: {} }
};

const vm = require('vm');
const context = vm.createContext(Object.assign({}, global, {
  window: {
    location: { pathname: '/super-admin.html', hash: '', href: '' },
    localStorage: { getItem: () => 'token', setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn) => {},
    clearTimeout: () => {},
    setInterval: (fn) => {},
    clearInterval: () => {},
    document: mockDoc,
    io: function() { return { on: ()=>{}, emit: ()=>{} }; },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  },
  document: mockDoc,
  localStorage: { getItem: () => 'token', setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { pathname: '/super-admin.html', hash: '', href: '' },
  io: function() { return { on: ()=>{}, emit: ()=>{} }; },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  XMLHttpRequest: function() {
    this.open = () => {};
    this.setRequestHeader = () => {};
    this.send = () => {};
  }
}));

context.window.window = context.window;
context.window.document = mockDoc;

try {
  vm.runInContext(js, context, { filename: 'super-admin.js' });
  console.log('Script loaded successfully in context.');

  console.log('Calling initAdminPanelUI()...');
  vm.runInContext('initAdminPanelUI()', context);
  console.log('SUCCESS: initAdminPanelUI() completed without any errors!');

  const tabs = [
    'sec-dash', 'sec-notificacoes', 'sec-bi', 'sec-restaurantes', 'sec-usuarios', 'sec-servidor',
    'sec-mensagens', 'sec-logs', 'sec-config', 'sec-ia-global', 'sec-funcoes', 'sec-features-restaurante',
    'sec-dominios', 'sec-capacidade', 'sec-mapa', 'sec-load-control', 'sec-licencas', 'sec-recuperar-acesso',
    'sec-clientes', 'sec-suporte', 'sec-terminal', 'sec-instancias', 'sec-suporte-remoto', 'sec-tarefas',
    'sec-site-vendas', 'sec-afiliados', 'sec-seguranca-waf', 'sec-deploy-updates', 'sec-plugins-modulos',
    'sec-tema-custom', 'sec-supabase', 'sec-alterar-senha', 'sec-synccheff', 'sec-infra-cloud', 'sec-tuneis',
    'sec-image-providers', 'sec-contador-gestao', 'sec-fin-custodia', 'sec-fin-assinaturas',
    'sec-fin-contratacoes', 'sec-fin-gateways'
  ];

  for (const tab of tabs) {
    try {
      vm.runInContext(`switchTab('${tab}')`, context);
    } catch (tabErr) {
      console.error(`ERROR in switchTab('${tab}'):`, tabErr);
    }
  }
  console.log('All tabs tested in switchTab!');

} catch (e) {
  console.error('ERROR during testing:', e);
}
