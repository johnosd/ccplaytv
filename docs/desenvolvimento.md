# Guia de desenvolvimento

Este documento reúne a visão técnica necessária para desenvolver, testar e empacotar o CCPlay TV. As decisões de longo prazo ficam nas [ADRs](../sdd/adr/) e o estado de cada feature fica no [backlog](../.planning/backlog.md).

## Arquitetura em poucas palavras

O aplicativo da TV vive em `tv-web/` e usa React 19, TypeScript e Vite. O catálogo, as preferências e a identidade de reprodução são guardados no IndexedDB do aparelho; a reprodução usa `PlayerService` e AVPlay na Samsung.

O portal (`portal-web/` e seus serviços) é opcional: atende pareamento, listas, recuperação, backup e licença. Ele não substitui a importação, o catálogo ou a reprodução local. A arquitetura client-first é definida na [ADR-008](../sdd/adr/ADR-008-arquitetura-client-first-backend-so-quando.md).

O projeto Tizen efetivo é `CCPlayTv/`, preenchido pelo script `tv-web/scripts/sync-tizen.mjs`. `tizen-app/` é um diretório legado e vazio.

## Estrutura relevante

```text
ccplayTv/
├── tv-web/             # Aplicativo React/TypeScript da TV
├── portal-web/         # Portal web vinculado à TV
├── api/                # Serviço e fallback de integração
├── CCPlayTv/           # Projeto de empacotamento Tizen
├── sdd/                # Specs, ADRs, bugs e avaliações
└── docs/               # Guias de produto, operação e design
```

## Pré-requisitos

- Node.js e npm para os frontends.
- Ferramentas Tizen, perfil de assinatura e `sdb` para emulador ou TV física.
- Dependências instaladas em cada projeto antes de executar comandos.

## Aplicativo da TV

Na raiz do repositório:

```bash
cd tv-web
npm install
npm run dev
```

Comandos principais, ainda dentro de `tv-web/`:

```bash
npm run test
npm run lint
npm run build
npm run build:tizen
```

`build:tizen` verifica TypeScript, gera os arquivos web, impede o demuxer de desenvolvimento no pacote e sincroniza a saída para `CCPlayTv/`.

### E2E

Deixe `npm run dev` aberto e, em outro terminal dentro de `tv-web/`, execute:

```bash
node e2e/run.mjs
```

Para um roteiro específico, use `node e2e/run.mjs --only nome-do-roteiro`. No PowerShell, essa forma direta evita problemas de encaminhamento de argumentos pelo npm.

## Portal web

```bash
cd portal-web
npm install
npm run dev
```

O portal requer a configuração e os serviços locais correspondentes. Iniciar o Vite não cria uma implantação comercial nem habilita cobrança. Consulte [operação do portal](portal/operacao.md) e [dependências](portal/dependencias.md) antes de alterar esse fluxo.

## Empacotamento e validação em TV

Execute `npm run build:tizen` antes dos fluxos de emulador ou TV física. A instalação é feita pelo processo `tizen-tv`/`deploy-tv.ps1`, que verifica conectividade, assina o pacote e instala o aplicativo.

Use o mesmo certificado ao atualizar o aplicativo para preservar os dados locais. Não desinstale o app para uma validação rotineira e não considere navegador ou emulador como prova de comportamento do hardware.

## Desempenho

Os benchmarks de telas ficam em `tv-web/scripts/bench/` e os resultados em `tv-web/bench-results/`. O comando de importação é:

```bash
npm run bench:import
```

O benchmark de navegador é uma referência controlada; ele não comprova pintura, memória ou fluidez na TV. Critérios de desempenho e evidências físicas pertencem à spec da feature correspondente.

## Regras que valem para qualquer mudança

- Leia a [constitution](../.planning/memory/constitution.md), as ADRs relevantes e o guia V14 antes de alterar UI, foco ou arquitetura.
- Preserve o fluxo por controle remoto: foco visível, SELECT para agir e RETURN para voltar ao item e posição anteriores.
- Não exponha segredos, credenciais, URLs de reprodução ou códigos de recuperação em logs, erros, interface não protegida ou exportações.
- Atualize a documentação viva da feature em `sdd/specs/<feature>/` quando o trabalho fizer parte de uma feature ativa.

## Próximas leituras

- [Produto e capacidades](produto.md)
- [Backlog e status](../.planning/backlog.md)
- [ADRs](../sdd/adr/)
- [Design System V14](design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md)
- [Práticas para TV](guia-praticas-app-tv/README.md)
