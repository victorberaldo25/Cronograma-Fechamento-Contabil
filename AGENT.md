# AGENT.md — Cronograma-Fechamento-Contabil

## Comandos
- Instalar: `npm install`
- Rodar API local: `npm start` (porta `PORT`, padrão 3000)
- Front estático: `npx serve . -l 8080`
- Test/lint: não configurados

## Estilo
- JS: `camelCase` para variáveis/funções, `UPPER_SNAKE_CASE` para constantes globais.
- Textos de interface em pt-BR.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `security:`).

## Regras invioláveis
- **Nunca** commitar dados reais: razão social, CNPJ/CPF, nomes de pessoas, valores extraídos do ERP, logos de empresas reais.
- **Nunca** commitar credenciais: senhas fixas, `apiKey`, IDs reais de projeto Firebase, `serviceAccountKey.json`, `.env`.
- Toda base de demonstração vem de dados sintéticos (`mock_data.js` ou gerador) — identidade fictícia **AgroTech Bioenergia S.A.**
- Antes de cada push, rodar a checagem de dados sensíveis (ver `SKILLS.md`).
- Não editar libs minificadas (`*.min.js`).
