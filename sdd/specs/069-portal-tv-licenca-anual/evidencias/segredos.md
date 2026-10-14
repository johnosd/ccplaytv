# Verificação de segredos — feature069

Em2026-10-11, testes locais com marcadores fictícios. Não foram lidos arquivos .env nem docs/m3u/dados.md.

| Fronteira | Evidência | Resultado/limite |
| --- | --- | --- |
| HTTP/Pydantic | api/tests/portal/test_secrets.py, 1 teste/2 requests inválidos | Campos futuros e credenciais inválidas retornam422 genérico; marcador/bearer ausentes dos logs capturados. PASS0.46s. |
| Exceções/proxy local | test_bootstrap.py | Erro inesperado sanitizado antes do logger; API/internal não caem na SPA; headers no-store/no-referrer/CSP. Integra suíte90/90 PASS. |
| Webhook/checkout | test_payments.py/test_mercadopago.py | Webhook cru/payer/card descartados; persistência mínima, lookup autenticado, preço/merchant/reference/moeda/mode verificados. Só transporte simulado. |
| Portal DOM/URLs | e2e/configuracao.spec.ts, recuperacao.spec.ts, licenca.spec.ts | Fragmento removido antes da rede, exchange único; segredo não aparece em cards; formulários preservam valores salvos sem lê-los; código privado em entrada protegida; checkout host HTTPS fixo.13/13 PASS2.2min. |
| TV | portal-configuracao.mjs/licenca-anual.mjs e testes de diálogo privado | Código/chave por ação explícita, ocultação no background, snapshots allowlist; lista/licença permanecem locais. Browser/fake, não hardware. |
| Transporte/entrypoint | portal_main.py e providers/mercadopago.py revisados | Uvicorn access_log=False; HTTPX usa caminhos fixos sem tokens na URL; exceções de SDK não chegam ao cliente. Revisão estática. |
| CI/nuvem | Configurações infra/portal revisadas | Templates usam placeholders/ADC, nenhum segredo incorporado. IAM, logs gerenciados e revisões reais ainda precisam T052. |

Não comprova ausência de segredo em infraestrutura ainda não implantada, em um pagamento real ou na TV física comercial. Repetir captura no projeto dedicado antes de habilitar venda.
