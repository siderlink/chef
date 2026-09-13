const sqlite3 = require('./sqlite3-wrapper').verbose(); 
const db = new sqlite3.Database('./database.sqlite'); 
db.run("INSERT INTO funcionarios (nome, usuario, senha, cargo, status) VALUES ('Super Admin Spy', 'spy', 'spy', 'Admin', 'Ativo')", function(err) { 
  if(err) {
    if(err.message.includes('UNIQUE')) {
       // if exists, update it
       db.run("UPDATE funcionarios SET cargo='Admin' WHERE usuario='spy'", (e) => {
         console.log("Usuário spy atualizado para Admin!");
       });
    } else {
       console.error(err); 
    }
  } else {
    console.log('Usuário spy criado!'); 
  }
});
