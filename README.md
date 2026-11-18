# KALLÍSTIS — REFORGED | Gate 01

Aplicação local para criar e selecionar perfis abertos de homologação. Os perfis ficam em SQLite no servidor; a seleção ativa é lembrada pelo navegador. Não há autenticação neste gate.

## Requisitos

- Node.js 24 ou superior (`node:sqlite` é usado sem dependências externas).
- Não é necessário executar `npm install`.

## Instalar e iniciar

```sh
cd /home/tonyus-dev/Portifolio/kallistis-reforged
node --version
npm run dev
```

Abra <http://127.0.0.1:4173>. Para iniciar no modo normal, use `npm start`. O servidor escuta somente em `127.0.0.1`; não o exponha em rede pública.

## Persistência

O banco é criado na primeira inicialização em `data/kallistis.sqlite`. Migrações ficam em `db/migrations/`. Cada perfil recebe um UUID estável; nomes são únicos sem distinguir maiúsculas de minúsculas. Reiniciar o servidor mantém os registros.

Para consultar diretamente o banco:

```sh
node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/kallistis.sqlite"); console.table(db.prepare("SELECT id, name, role, created_at FROM profiles ORDER BY name").all()); db.close();'
```

## Verificação manual

1. Inicie com `npm run dev` e abra `http://127.0.0.1:4173`.
2. Crie `TAL` com o tipo Mestre e `JOGADOR-01` com o tipo Jogador.
3. Ative cada perfil e confirme o destaque “PERFIL ATIVO”.
4. Recarregue a página; o perfil ativo deve continuar selecionado.
5. Encerre o servidor com `Ctrl+C`, execute `npm start` e confirme que os dois perfis continuam na lista.
6. Consulte as linhas com o comando SQL acima.
7. Redimensione o navegador para desktop e largura móvel; a lista e o formulário devem continuar utilizáveis.

Este gate entrega apenas a fundação de perfis. Personagens, motor de regras, chats, autenticação e publicação não estão implementados.
