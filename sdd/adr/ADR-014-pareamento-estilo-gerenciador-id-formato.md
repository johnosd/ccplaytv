# ADR-014: Pareamento estilo gerenciador — ID formato MAC, chave numérica e valores salvos no painel

## Status

Aceita (2026-10-13). Emenda a ADR-013 nos pontos de identificação manual da TV e de leitura de configurações pelo navegador. Formalizada na constitution 1.10.0.

## Data

2026-10-13

## Contexto

A feature 069 entregou o portal (QR efêmero, device key de 256 bits revelada só por ação protegida, navegador nunca recebe segredo salvo). Validada na TV física, a entrada foi considerada confusa pelo usuário. Ele pediu o modelo dos gerenciadores de playlist do mercado (referência: fotos de um app concorrente): a tela "Adicionar" da TV mostra **ID do dispositivo no formato MAC** e **chave numérica** o tempo todo, junto do endereço do painel e do QR; o painel entra por ID + chave, mostra status/validade e permite editar listas **vendo os valores salvos**; na TV, os campos não escondem o que se digita.

Essas decisões contrariam três cláusulas de "Segredos Fora dos Clientes e dos Logs" (constitution 1.9.0). O usuário as manteve após aviso de risco (feature 070, sdd-specify e sdd-plan de 2026-10-13).

## Decisão

1. **ID do dispositivo** no formato `XX:XX:XX:XX:XX:XX`: MAC da TV quando disponível e útil; sem MAC, ou se o ID já pertence a outra TV, o serviço gera um ID aleatório *localmente administrado* e unicast. Único por claim transacional. Não é segredo e não autentica sozinho; a identidade interna não muda.
2. **Chave do dispositivo** numérica, permanente, de **10 dígitos** (CSPRNG), exibida o tempo todo **somente** na tela Adicionar da TV; o serviço guarda só HMAC; "Gerar nova chave" usa a rotação `revoke` existente (invalida chave e sessões).
3. **Entrada manual** no painel por ID + chave, com limites por par ID/origem, por ID, por origem e global, e recusa uniforme.
4. **Valores salvos ao painel**: rota de leitura só para a sessão `manage` da própria TV, decifra transitoriamente a versão corrente, sem cache e sem log.
5. **TV**: credenciais visíveis na digitação e na edição da própria lista, com um controle para ocultar.
6. Continuam proibidos: logs, URL, QR, cards comuns, erros, analytics, checkout, exportação e terceiros.

## Alternativas Consideradas

### PIN de pareamento efêmero (6 dígitos, 5 min)

Mais seguro contra foto da tela. Rejeitado pelo usuário: quer a chave permanente do modelo de referência.

### Chave revelada só por ação explícita (status quo da 069)

Cumpre a 1.9.0, mas é exatamente o fluxo considerado confuso.

### Painel sem segredo salvo ("em branco preserva")

Mantém a regra da 069. Rejeitado: o usuário quer editar vendo a senha.

### ID sempre gerado (sem MAC)

Sem permissão nova e sem dado de hardware. Mantido só como fallback; o usuário prefere o MAC.

## Consequências

### Positivas

- Entrada familiar e digitável no celular; menos passos até adicionar uma lista.
- Edição no painel e na TV sem redigitar credenciais.

### Negativas

- Foto/screenshot da tela Adicionar dá acesso permanente à gestão das listas até "Gerar nova chave".
- Sessão do painel sequestrada expõe credenciais IPTV salvas da TV.
- MAC exibido é dado de hardware e pode exigir privilégio de rede no pacote.
- TVs já cadastradas precisam de uma rotação para ganhar ID e chave novos.

### Caminho de Migração / Evolução Futura

- Upgrade automático por uma rotação `revoke` ao abrir a tela Adicionar.
- Se o risco se materializar, voltar ao PIN efêmero é compatível: a chave vira código temporário sem mudar o painel.
- Produção com venda exige revisar este risco antes de abrir comercialmente (gates da 069).
