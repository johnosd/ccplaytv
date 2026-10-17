# Acesso de demonstração (DemoAccess) — sanitizado

Referência para o campo de acesso de teste do Seller Office (`SAM-KIT-TESTACCESS`). **Nenhum valor
de credencial entra aqui, no git ou em log** (FR-012, FR-016): só onde o segredo está e quem
responde por ele.

| Campo | Valor |
| --- | --- |
| Variante | base |
| Tipo de lista | a definir (lista Xtream ou M3U de teste, autorizada pelo provedor) |
| Onde está o segredo | cofre da pessoa responsável pela release — a definir |
| Dono | release |
| Validade | a definir — precisa cobrir a janela de revisão da Samsung e os modelos da matriz |
| Escopo | só leitura de catálogo e reprodução; sem acesso ao painel do provedor |

Quando a lista de teste existir, registre a validade numa linha `validUntil: AAAA-MM-DD` neste
arquivo, atualize o hash no `manifest.json` e mude o item para `Pass`. O gate bloqueia o item sem
`validUntil`, com a validade vencida, ou na variante comercial (sem licença/voucher de teste para o
revisor, R-004).
