const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');
const lines = js.split('\n');

const modalIds = [
  "modal-broadcast-super",
  "modal-delegar-suporte",
  "modal-instalador-sync",
  "modal-gerar-link-suporte",
  "modal-gerar-chave",
  "modal-bloquear-instancia",
  "modal-mensagem-instancia",
  "modal-diagnostico-instancia",
  "modal-imgprov-preset",
  "modal-imgprov-manual",
  "modal-imgprov-edit",
  "modal-tarefa",
  "modal-atribuir-demanda-superadmin",
  "modal-criar-demanda-superadmin",
  "modal-pagar-bonificacao-superadmin",
  "modal-contestar-custodia",
  "modal-resolver-disputa",
  "modal-editar-assinatura",
  "modal-nova-custodia",
  "modal-nova-task-suporte",
  "modal-enviar-aviso-suporte",
  "modal-criar-missao-surpresa",
  "modal-qrcode-acesso-global",
  "modal-comando-rapido-s23"
];

modalIds.forEach(id => {
  console.log(`\n=== ${id} ===`);
  lines.forEach((line, idx) => {
    if (line.includes(id)) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
});
