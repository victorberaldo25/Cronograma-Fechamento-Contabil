# MEMORY.md — Cronograma-Fechamento-Contabil

## Status atual (2026-11-08)
- Segurança corrigida em 2026-11-08: `JWT_SECRET` sem valor fixo; admin inicial com senha via `ADMIN_INITIAL_PASSWORD` ou aleatória.
- Logos estavam corrompidas (bytes removidos no upload) — substituídas.

## Pendências / próximos passos
- Definir `JWT_SECRET` e `ADMIN_INITIAL_PASSWORD` no ambiente de produção.
- Se a versão antiga rodou em produção: trocar a senha do `admin@fecho.com` e invalidar sessões.
- Quebrar `index.html` em módulos.

## Decisões
- Identidade fictícia única para o portfólio: **AgroTech Bioenergia S.A.** / VB Systems.
- Repositório reescrito em commit único limpo para não manter dados reais no histórico.

## Pegadinhas
- Sem `JWT_SECRET` no ambiente, as sessões caem a cada restart (segredo aleatório por processo).
- `serviceAccountKey.json` nunca deve ir para o git (está no `.gitignore`).
- PNG precisa de `.gitattributes` binário para não corromper.
