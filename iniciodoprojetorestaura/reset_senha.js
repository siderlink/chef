/**
 * reset_senha.js
 * Script para resetar a senha de um usuário administrador no sistema Chef Cozinha.
 * 
 * Uso: node reset_senha.js <email> <nova_senha>
 * Exemplo: node reset_senha.js ze@gmail.com minhaNovaS3nha!
 */

const sqlite3 = require('./sqlite3-wrapper').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('\n❌ Uso incorreto!');
  console.log('   Uso:     node reset_senha.js <email> <nova_senha>');
  console.log('   Exemplo: node reset_senha.js ze@gmail.com minhaNovaS3nha!\n');
  process.exit(1);
}

const [email, novaSenha] = args;

const dbFiles = [
  path.join(__dirname, 'master.sqlite'),
  path.join(__dirname, 'database.sqlite'),
  path.join(__dirname, 'database_1.sqlite'),
];

async function resetarSenha(dbFile) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, (err) => {
      if (err) return reject(new Error(`Não foi possível abrir ${dbFile}: ${err.message}`));

      db.get("SELECT * FROM usuarios WHERE username = ?", [email], async (err, row) => {
        if (err) {
          db.close();
          return reject(new Error(`Erro ao buscar usuário: ${err.message}`));
        }
        if (!row) {
          db.close();
          return resolve(null); // não encontrado neste banco
        }

        try {
          const hash = await bcrypt.hash(novaSenha, 10);
          db.run("UPDATE usuarios SET password_hash = ? WHERE username = ?", [hash, email], function(err2) {
            if (err2) {
              db.close();
              return reject(new Error(`Erro ao atualizar senha: ${err2.message}`));
            }
            db.close();
            resolve({ dbFile, row });
          });
        } catch (hashErr) {
          db.close();
          reject(new Error(`Erro ao gerar hash: ${hashErr.message}`));
        }
      });
    });
  });
}

(async () => {
  console.log('\n🔐 Chef Cozinha — Reset de Senha');
  console.log('================================');
  console.log(`Email alvo : ${email}`);
  console.log(`Bancos     : ${dbFiles.length} arquivos verificados\n`);

  let encontrou = false;

  for (const dbFile of dbFiles) {
    try {
      const result = await resetarSenha(dbFile);
      if (result) {
        console.log(`✅ Senha redefinida com sucesso!`);
        console.log(`   Banco    : ${path.basename(result.dbFile)}`);
        console.log(`   Email    : ${result.row.username}`);
        console.log(`   Cargo    : ${result.row.role}`);
        console.log(`   Nova senha: ${novaSenha}`);
        console.log('\n💡 O cliente já pode fazer login com as novas credenciais.\n');
        encontrou = true;
      }
    } catch (e) {
      // Silencia erros de bancos que não têm a tabela ou o usuário
    }
  }

  if (!encontrou) {
    console.log(`❌ Email "${email}" não encontrado em nenhum banco de dados.`);
    console.log('\n📋 Usuários cadastrados no sistema:\n');

    // Lista todos os usuários para ajudar
    for (const dbFile of dbFiles) {
      await new Promise((resolve) => {
        const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
          if (err) return resolve();
          db.all("SELECT id, username, role, ativo, data_cadastro FROM usuarios", [], (err2, rows) => {
            if (!err2 && rows.length > 0) {
              console.log(`  [${path.basename(dbFile)}]`);
              rows.forEach(r => {
                console.log(`    ID ${r.id}: ${r.username} (${r.role}) — ativo: ${r.ativo ? 'sim' : 'não'}`);
              });
              console.log('');
            }
            db.close();
            resolve();
          });
        });
      });
    }
  }
})();
