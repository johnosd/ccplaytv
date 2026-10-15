# Research — 070 Entrada de listas estilo gerenciador

## 1. Leitura do MAC na TV

- **Decisão**: tentar `webapis.network.getMac()` (Samsung Product API) dentro de `try/catch`, normalizar com `displayIdFromMac` e enviar no cadastro; sem valor útil, o servidor gera o ID (D-002).
- **Justificativa**: é o formato pedido pelo usuário e o do app de referência; o fallback garante que a feature funciona mesmo sem a API.
- **Incerteza a provar na TV física (T003)**: (a) se a API existe no Tizen 9 do QN50Q60DAGXZD com o pacote em `file://`; (b) se exige o privilégio `http://developer.samsung.com/privilege/network.public` no `config.xml`; (c) se devolve o MAC da interface ativa (Wi-Fi vs. cabo) e se muda ao trocar de rede. Medir com a sonda `platformProbe.ts` estendida, sem desinstalar o app (dados preservados).
- **Alternativas**: ID sempre gerado (rejeitado pelo usuário como padrão, mantido como fallback); DUID formatado (43+ caracteres, não parece MAC).

## 2. MAC que muda ao trocar de interface

- **Decisão**: o `displayId` é fixado no cadastro e só muda em novo cadastro; não acompanha troca de Wi-Fi/cabo.
- **Justificativa**: o ID exibido precisa ser estável para a pessoa digitar no painel; o servidor mapeia `displayId` → `deviceId`.

## 3. Formato da chave

- **Decisão**: 10 dígitos decimais uniformes (CSPRNG), sem separadores na exibição principal (o usuário pediu "nesse estilo": `1732049818`).
- **Justificativa**: 10¹⁰ combinações com limites de tentativa tornam a força bruta inviável online; números são fáceis de digitar no celular.
- **Alternativas**: 6 dígitos (pedido inicial, recusado após aviso), token longo (ruim para digitar).

## 4. Onde decifrar os valores para o painel

- **Decisão**: reaproveitar a rotina de `configuration_delivery.pull` (decifra a `configurationVersion` corrente) num caminho novo, de leitura, autorizado pela sessão de navegador da mesma TV.
- **Justificativa**: uma única rotina de decifragem/validação de contexto (AAD com deviceId/sourceId/versão) evita divergência de formato.
