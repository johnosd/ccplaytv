# Reavaliação: chave padrão protegida e credencial pessoal opcional

- **Data**: 2026-10-21
- **ADR**: [ADR-021](../../adr/ADR-021-chaves-padrao-protegidas-byok.md)
- **Veredito atual do assessment**: needs-clarification
- **Motivo da reabertura**: o usuário substituiu BYOK exclusivo por chave padrão do ccplayTv mantida no serviço, com credencial pessoal opcional e acesso direto quando permitido.

## Define Atualizado

**Problema:** o usuário encontra filmes/episódios sem legenda adequada em pt-BR, en ou es. Quer obter uma alternativa dentro do app, com uma experiência padrão que não exija configurar chave pessoal; deseja poder usar a própria credencial quando o fornecedor permitir.

**Usuários afetados:** pessoa que relatou a dor, demais usuários com títulos sem legenda adequada (volume não medido) e operação do ccplayTv, responsável pelo consumo das chaves padrão.

**Goals:** fornecer acesso opcional a legendas; disponibilizar operações de TMDB já existentes com a mesma estratégia de credenciais; guardar chaves padrão no servidor; preservar modo pessoal direto quando admitido; manter Direct Play e comandos locais independentes.

**Non-goals:** chave do desenvolvedor no pacote; proxy de vídeo/catálogo; entrega de credencial padrão à TV; contratação/implantação; prometer acesso a todo recurso das APIs; automatizar consultas por foco; presumir que conta/token pessoal equivale a API key pessoal.

**Métricas:** preservadas as provas e as métricas operacionais de [problem.md](./problem.md), substituindo o gate de BYOK obrigatório pela definição do modo padrão autorizado. Seis combinações filme/episódio × pt-BR/en/es responderam 200; um arquivo pt-BR foi obtido. Ainda precisam ser medidos fluxo/sincronismo na TV, cache, ausência de requisições por foco, custos/cotas no modo padrão e falhas sem bloquear o player.

**Custo de inação:** a dor de compreensão continua e o usuário precisa de outra ferramenta. Não há medição de receita, retenção ou cobertura que justifique prioridade comercial quantitativa.

## Scorecard Revisto

| Critério | Avaliação | Evidência e limite |
| --- | --- | --- |
| Validade do problema | strong | Dor pessoal confirmada em filme/série; idiomas definidos |
| Força da evidência | adequate | API e arquivo reais no PC; suporte nativo documentado; sem amostra de streams reais nem validação Tizen |
| Valor vs. custo de inação | adequate | Ganho direto de conveniência e alternativa para títulos afetados; impacto agregado ainda não medido |
| Viabilidade / apetite | unknown | Apetite por serviço foi confirmado e o antigo bloqueio de BYOK exclusivo foi removido. A oferta padrão ainda requer condições/cotas aplicáveis, compatibilização das novas chamadas ao serviço e delimitação de disparos |
| Fit estratégico | adequate | ADR-021 aceita complemento opcional e mantém núcleo local; sem mudança aprovada para expor chave no cliente |

O unknown não é falta de preferência do usuário: a preferência já foi perguntada e respondida. Restam condições externas e normativas a verificar, que não são inferidas a partir do teste da API.

## Abordagens Candidatas

1. **Chaves padrão no serviço + credencial pessoal opcional (selecionada).** Chave compartilhada fica privada; o caminho pessoal direto existe somente quando permitido. É a arquitetura aceita pela ADR-021.
2. **Chave padrão dentro do pacote (rejeitada).** Exposição da cota comum e conflito com a regra de segredos.
3. **Exclusivamente BYOK (substituída).** Não atende mais ao requisito de integração pronta para quem não configurar uma chave.

## Decide Atualizado

**needs-clarification permanece**, com motivação revisada. A arquitetura foi decidida; o assessment ainda não concede go para a feature inteira. A aceitação de um serviço não demonstra os termos/cotas aplicáveis à oferta nem emenda automaticamente regras da constitution.

O antigo requisito de confirmar BYOK para toda a proposta deixou de bloquear o modo padrão. O BYOK do OpenSubtitles permanece uma opção condicionada ao fornecedor; não é necessário obrigar todos os usuários a criá-lo. Conta/token pessoal pode ser uma alternativa de consumo a estudar, sem prometer que substitui a chave de aplicação.

### Pendências para Revisitar Explora/Define

- Confirmar condições de consumo/distribuição do consumer de aplicativo, cota do modo padrão e necessidade de conta/token ou plano; não extrapolar remaining=99 para uma franquia universal. A aprovação arquitetural não autoriza uma contratação.
- Verificar licenciamento/atribuição do TMDB para o modo padrão do produto. O modelo pessoal atual não prova a adequação da nova oferta.
- Delimitar as operações e gatilhos de chamadas a metadados/legendas e compatibilizar o texto da constitution com o complemento, sem reativar polling de licença/listas.
- Tratar BYOK do OpenSubtitles como capacidade pendente de aceitação, sem bloquear o desenho da opção padrão por essa questão específica.
- Definir uma prova física de legenda externa/sincronismo quando houver autorização para acessar o aparelho. É gate técnico de entrega; os testes no PC não o substituem.

**Fase a revisitar:** explora/define. Não iniciar sdd-specify automaticamente com este veredito. Os registros originais foram mantidos; esta revisão é a interpretação vigente da nova escolha.

## Escopo da Alteração Documental

ADR-021 criada; notas de emenda nas ADRs relacionadas; confirmação anexada à proposta e aos relatórios do assessment. Nenhuma chave foi lida novamente, nenhum teste de API foi repetido e nenhum código-fonte, .env, constitution, infraestrutura ou dado da TV foi alterado.
