# SKILLS.md

## Checklist antes de qualquer push
- [ ] `git diff --cached` revisado
- [ ] Varredura de dados sensíveis (sem resultados reais):
  ```bash
  grep -rnIE --exclude-dir=.git --exclude=*.min.js \
    "[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|AIza[0-9A-Za-z_-]{30}|senha\s*[:=]\s*['\"][^'\"]+|firebaseapp\.com" .
  ```
- [ ] Nenhum nome de pessoa, cliente ou fornecedor real nos exemplos/JSON embutidos
- [ ] Imagens novas são próprias/fictícias (sem logos de terceiros)

## Novo dado de demonstração
1. Gerar sintético (nomes genéricos tipo `ALFA PECAS LTDA`, `COMPRADOR 01`; CNPJ `11.111.111/0001-11`).
2. Manter a estrutura de campos igual à exportação real do Protheus.
3. Nunca colar extração real "só para testar" — usar arquivo local ignorado pelo `.gitignore`.

## Release
1. Atualizar `MEMORY.md` (status + decisões).
2. Commit `chore(release): vX.Y.Z` e tag `git tag vX.Y.Z && git push --tags`.

## Fim de sessão
- Pedir ao agente: "Atualize o MEMORY.md com as decisões de hoje".
