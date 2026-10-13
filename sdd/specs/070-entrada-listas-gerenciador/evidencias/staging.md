# Evidência de staging — feature 070

Data: 2026-10-13 (UTC). Publicação autorizada pelo usuário nesta sessão.

## Publicação

- Projeto: `ccplaytv-511322`, região `us-central1`.
- Cloud Build: `93e3daf1-2742-44ee-a1c8-c46f8884ad7c`, status `SUCCESS`.
- Serviço: `ccplaytv-portal`.
- Revisão: `ccplaytv-portal-00014-tr5`.
- Tráfego: 100% na revisão nova.
- URL: `https://ccplaytv-portal-dvpldo267q-uc.a.run.app`.

## Smoke e segurança

- `GET /health`: HTTP 200, `Cache-Control: no-store`.
- `GET /`: HTTP 200.
- `GET /portal/v1/configurations` sem sessão: HTTP 401.
- Endpoint público de chaves devolveu somente JWK ES256 pública `kid=v1`, usada
  no build comercial local; nenhuma chave privada foi impressa ou empacotada.
- Consulta dos 100 logs recentes do serviço encontrou **0** marcadores de
  credencial, senha, bearer ou fixture sensível.

## Pacote e E2E

- `npm.cmd run build:tizen:commercial` com `VITE_PORTAL_ORIGIN` do staging e a
  JWK pública: PASS; pacote sincronizado em `CCPlayTv/`.
- `node e2e/portal-pacote-file.mjs`: PASS — painel por controle, licença,
  QR, relógio atrasado em 5 s e chave numérica.

O staging continua com checkout desativado. Esta evidência não substitui a
validação de reprodução AVPlay nem a observação na TV física.
