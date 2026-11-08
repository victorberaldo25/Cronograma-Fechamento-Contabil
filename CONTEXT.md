# CONTEXT.md — Cronograma-Fechamento-Contabil

## Produto
Orquestrador do cronograma de fechamento contábil-fiscal (D-5 a D+5) com tarefas por setor, SLA e log de atividades. Backend Express em Firebase Functions com Firestore.

## Estrutura
- `index.html` — SPA (monolítica, ~5 mil linhas)
- `js/app.js`, `css/style.css`
- `server.js` — API Express (JWT em cookie, bcrypt) exportada como Cloud Function `api`
- `logo-azul.png`, `logo-branca.png` — logo fictícia AgroTech
- `mock_data.js` — dados sintéticos (não carregado pelo `index.html`)

## Tecnologias
Node.js ≥16, Express, firebase-admin, firebase-functions v2, jsonwebtoken, bcryptjs, Firestore. Front: JS vanilla, SheetJS, Font Awesome.
