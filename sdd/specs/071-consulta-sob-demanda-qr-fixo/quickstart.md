# Quickstart de validação — 071

## 1. Pré-condições

Constitution 1.11.0 e ADR-016 aprovadas; API com a rota `POST /device/sources` e a âncora publicada no staging **antes** de instalar na TV.

## 2. Automático

```powershell
cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build; npm run build:tizen
node e2e/consulta-sob-demanda.mjs        # E2E novo (pilha local)
npm run test:e2e                         # com `npm run dev` comum
cd ..\api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q
cd ..\portal-web; npm run lint; npm run test; npm run build; npm run test:e2e
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 071-consulta-sob-demanda-qr-fixo
```

## 3. Cenário ponta a ponta (dev server / pilha local)

1. App novo, offline: abre, teste começa, usa; 0 requisições.
2. Online, abrir **Adicionar lista**: cadastro único; ID/chave/QR aparecem; trial ancorado.
3. Ler o QR no navegador: painel abre autenticado, sem digitar; endereço limpo (sem `#`).
4. Criar lista no site → **Recarregar** na TV: volta à lista com foco na nova.
5. Adicionar lista na TV → site mostra nome/host/usuário/senha em segundos; offline vai para a fila e sobe no Atualizar.
6. 1ª **Atualizar** na tela de listas: todas as listas existentes sobem uma vez.
7. Avançar o relógio 7 dias: entrada na lista mostra o bloqueio com QR/endereço/ID/chave; 0 requisições.
8. Comprar (sandbox) e **Atualizar** no bloqueio: libera e entra na lista negada.
9. TV parada 24 h em qualquer tela: 0 requisições (log do serviço).
10. **Gerar nova chave**: QR antigo recusado, QR da tela muda.

## 4. TV física (gate antes de cobrar)

Instalar o pacote comercial **sem desinstalar**; repetir 2–8; conferir texto ≥ 20 px, foco e RETURN; medir tempos do Atualizar. Sem hardware não há veredito sobre AVPlay/relógio do aparelho.

## 5. Revisão de segredos

Inspecionar DOM, requisições, logs da API, cabeçalhos e histórico do navegador com marcadores fictícios: chave nunca em path/query/log; credenciais só no corpo de `POST /device/sources` e na resposta `values` da própria sessão.