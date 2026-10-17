# Quickstart — 073 Compra de licença por Pix na TV

Verificação manual e automatizada. Nada aqui liga cobrança real: `checkout_enabled` só no staging com o Mercado Pago
em modo de teste (FR-015, gates R-022–R-026 da 069).

## 1. Pré-requisitos

- Emulador do Firestore em `127.0.0.1:8085` (`$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'`, ou
  `npm run dev:portal` em `tv-web/`, que sobe tudo).
- API: `api/.venv` sincronizado (`uv sync --locked`).
- Staging (só com confirmação do usuário): conta Mercado Pago de teste com **chave Pix cadastrada**, credencial de
  teste no Secret do Cloud Run, `CCPLAY_PORTAL_PIX_PAYER_DOMAIN` definido, `checkout_enabled` verdadeiro **só** no
  staging. Ver `docs/portal/deploy-staging.md`.
- Constitution 1.13.0 aprovada (T001) antes da US3.

## 2. Checagens automatizadas

```powershell
# Contratos (5) e travas que esta feature pode quebrar
cd tv-web; npx vitest run src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts; cd ..
foreach ($s in '073-compra-licenca-pix','072-desvincular-backup','071-consulta-sob-demanda-qr-fixo','070-entrada-listas-gerenciador','069-portal-tv-licenca-anual','026-home-busca-configuracoes-ds-v14') { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $s }

# TV
cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build; npm run build:tizen; cd ..

# API (emulador ligado)
cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider; .venv\Scripts\python.exe -m ruff check .; cd ..

# Portal web
cd portal-web; npm run lint; npm run test; npm run build; npm run test:e2e; cd ..

# E2E da TV (com `npm run dev` rodando em outro terminal)
cd tv-web; node e2e/compra-licenca-pix.mjs; node e2e/licenca-anual.mjs; node e2e/legibilidade-tv.mjs; npm run test:e2e; cd ..
```

## 3. Cenário ponta a ponta (navegador + portal fictício, depois staging de teste)

1. Build comercial com teste local vencido; abrir uma lista → bloqueio com **Comprar licença** focado.
2. Mover o foco entre as ações: nenhuma requisição (Network do DevTools / contador do E2E).
3. SELECT em Comprar licença → "Gerando o Pix…" → QR, copia-e-cola, R$ 35, 12 meses, ID da TV, "Pix vence em 30 min".
4. RETURN → volta ao bloqueio com foco em Comprar licença. Abrir de novo → **mesmo** copia-e-cola (sem nova cobrança).
5. Atualizar sem pagar → "Pagamento ainda não confirmado."
6. Staging: pagar o Pix de teste (usuário de teste do Mercado Pago); Atualizar → "Licença ativa até …" e a lista negada
   abre. A licença local tem `expiresAt` = confirmação + 12 meses.
7. Esperar o Pix vencer (ou prazo curto no fixture) → "Este Pix venceu." → Gerar novo Pix → copia-e-cola diferente.
8. Desligar a rede → Comprar licença → "Sem conexão com o serviço." com Tentar novamente e Voltar; nada fala em recusa.
9. Configurações → Portal & licença → **Renovar licença** (licença ativa) → tela de Pix; pagar → Atualizar → validade
   somada (+12 meses sobre o vencimento atual).
10. Portal: aba **Renovar licença**/**Comprar licença** com situação e validade; com Pix pendente da TV aparece o aviso
    e nenhuma cobrança nova; pagar com cartão de teste → Atualizar na TV → +12 meses.
11. Pix da TV **e** cartão do portal pagos no mesmo pedido → duas concessões (24 meses), nenhuma conciliação presa.
12. Portal: "Mostrar código de recuperação" antes de qualquer Atualizar na TV → orientação "aperte Atualizar na TV";
    depois de Atualizar na TV → código igual ao de Portal & licença; recarregar a página não o mostra de novo sem nova
    ação. Rotacionar o código na TV → portal pede Atualizar de novo; depois mostra o novo.
13. Recuperação após formatar (simulada em laboratório): recuperar pelo site com o código visto no portal.

## 4. TV física (gate desta feature — SC-007; só com confirmação do usuário, `tizen-tv`)

- QR Pix lido por um celular do sofá (≈ 2–3 m) com o app do banco de teste/sandbox; copia-e-cola legível.
- Fluxo 1–6 acima por controle remoto; RETURN em cadeia volta ao bloqueio e depois às listas.
- Atualizar a TV preservando dados (nunca reinstalar a TV do usuário).

## 5. Itens cross-cutting

- Revisão de segredos (constitution): grep de `qrCode`, `pix_qr_code`, `recoveryCode`, `escrow` em logs, erros,
  `repr`, diagnósticos e E2E; respostas `no-store` conferidas.
- Legibilidade: telas novas em `tv-web/e2e/legibilidade-tv.mjs` (pt/en/es, ≥ 20 px, sem corte).
- Arquivos emitidos: nenhum asset novo esperado; se o build emitir algo novo, ele entra em
  `CCPlayTv/tizen_web_project.yaml` (guarda do `sync-tizen`).
- Publicação: API no staging **antes** do pacote na TV.
