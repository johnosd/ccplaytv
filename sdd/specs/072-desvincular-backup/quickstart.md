# Quickstart — 072

## 1. Pré-condições

- Fase 1 aprovada (constitution 1.12.0 e ADR-017).
- Emulador Firestore (Java 21: `JAVA_HOME` do Android Studio) e `api/.venv`; ou `cd tv-web; npm run dev:portal`.

## 2. Automático

```powershell
cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build
cd ..\api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q; .venv\Scripts\python.exe -m ruff check .
cd ..\portal-web; npm run lint; npm run test; npm run build
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 072-desvincular-backup
cd tv-web; node e2e/desvincular-backup.mjs
```

## 3. Cenário ponta a ponta (pilha local)

1. TV pareada com 2 listas, favoritos, histórico, progresso, uma categoria bloqueada com PIN e chave TMDB.
2. **Atualizar** na tela de listas → Portal & licença mostra "Último backup: <data>"; o site mostra só data e contagens.
3. **Desvincular** → confirma → "Desvinculada" (backup feito antes). Dados de uso intactos.
4. **Atualizar** → a TV volta ao **mesmo** ID com chave nova; QR antigo recusado no site.
5. Apagar o IndexedDB (simula reinstalação) → abrir → recuperar pelo site (069) → **Atualizar** → aparece
   "Restaurar backup de <data>?" → Restaurar → favoritos/histórico/progresso/PIN/TMDB voltam, cada um na sua lista.
6. Repetir 5 com uma lista que ainda não voltou do site → dados dela ficam pendentes → **Atualizar** com a lista de
   volta → aplicados. Com relógio + 6 dias → descartados.
7. **Agora não** na oferta → Atualizar não sobe nada; "Fazer backup agora" pede confirmação para substituir.
8. Apagar backup no site → TV mostra "sem backup" no próximo Atualizar.
9. Sem internet: Desvincular funciona e avisa "o backup não foi feito".
10. Marcadores fictícios (senha, URL, chave TMDB, PIN) ausentes de logs da API, URLs, erros e do site.

## 4. TV física (recomendação, não gate)

Instalar sem desinstalar; repetir 2–4 e 7; conferir foco, RETURN e textos ≥ 20 px.
