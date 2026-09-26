# CCPlayTV Design System V14 — Spectrum

**Plataforma alvo:** Samsung Smart TV / Tizen Web App  
**Versão do Design System:** V14 — Spectrum  
**Component Lab de referência:** `CCPlayTV_Design_System_Component_Lab_v14_Spectrum.html`  
**Formato-base:** 1920 × 1080 (16:9)  
**Paradigma de interação:** 10-foot UI, remote-first, quatro direções + Select/OK + Return  
**Tema:** Dark Spectrum streaming UI — superfícies neutras escuras + accent laranja + gradiente multicolorido da marca  
**Princípio técnico:** standalone, assets locais no shell, sem dependências externas obrigatórias

---

## 1. Objetivo do sistema

O CCPlayTV Design System existe para manter uma experiência consistente entre **Home, TV ao vivo, catálogo de filmes e séries, busca, player, IA, EPG, perfis, fontes IPTV e integrações BYOK**.

A interface deve parecer um produto de entretenimento nativo de televisão, não uma aplicação web ampliada. O conteúdo é protagonista. Navegação, integrações, filtros e status técnicos aparecem somente quando necessários.

O V13 transforma o Component Lab em referência normativa para novos componentes. Qualquer componente novo deve passar por quatro filtros antes de entrar no produto:

1. funciona integralmente com controle remoto;
2. permanece legível a aproximadamente 3 metros;
3. não depende de efeitos visuais caros ou recursos externos para funcionar;
4. possui estados de foco, pressed, disabled, loading e erro quando aplicável.

---

## 1.1 O que muda na V13

A V13 mantém a linguagem visual do V12 e adiciona uma camada de comportamento nativo do Tizen. Os novos pilares são:

- **Samsung IME** para busca, M3U, Xtream, XMLTV/EPG e BYOK;
- **Voice Guide + ARIA** com nomes acessíveis e anúncios de estado;
- **soft disabled vs hard disabled**;
- **legendas acessíveis** com tamanho, cor, fundo e contorno;
- **network/lifecycle state machine**;
- **memória de foco por área/categoria**;
- **long press / key repeat** sem iniciar previews repetidamente;
- **Smart Remote media keys** integradas ao player;
- **entrada numérica de canal** em TV ao vivo;
- **erros acionáveis** com causa, código e próxima ação.

Esses comportamentos passam a ser requisitos do design system, não detalhes opcionais da implementação.

---

## 2. Linguagem visual V14 — Spectrum

A V14 mantém toda a arquitetura funcional e comportamental da V13.x, mas substitui a linguagem visual pela identidade definida no Style Guide CCPlayTv.

### 2.1 Identidade

- fundo escuro sólido;
- superfícies neutras em cinco níveis;
- `#FF7A3D` como accent funcional primário;
- gradiente da marca `rosa → laranja → amarelo → verde → teal`;
- gradiente completo reservado a **logo, splash, ícone e decoração pontual**;
- conteúdo e texto nunca usam o gradiente como efeito decorativo recorrente.

### 2.2 Logo

**Wordmark**

- família de referência: Poppins 800;
- pode usar o gradiente completo da marca;
- fundo sempre escuro;
- nunca aplicar sobre fotografia sem área sólida de proteção.

**Ícone**

- quadrado arredondado;
- gradiente completo;
- triângulo de play em negativo com cor do fundo;
- uso em splash, launcher/atalho da TV e identidade compacta.

### 2.3 Regra Tizen para fontes

Poppins e Inter definem a intenção visual.

Em produção:

- empacotar os arquivos de fonte localmente quando a licença permitir;
- nunca depender de Google Fonts/CDN para o shell;
- fallbacks obrigatórios:

```css
font-family: 'Poppins', Arial, Helvetica, sans-serif;
font-family: 'Inter', Arial, Helvetica, sans-serif;
```

Se as fontes customizadas não estiverem disponíveis, o app continua utilizável e navegável com o fallback.

---

## 3. Princípios Tizen TV


### 2.1 10-foot UI

Elementos essenciais precisam continuar legíveis a aproximadamente **3 metros**.

Regras práticas:

- títulos e ações têm prioridade sobre metadata;
- leitura contínua usa no mínimo **16 px**;
- informação útil não deve ficar abaixo de **14 px**;
- microtexto de 12 px é reservado a labels curtas e não essenciais;
- nunca usar blocos longos de texto quando uma síntese resolve.

### 2.2 Four-way first

Todo fluxo principal precisa ser concluído usando apenas:

- `↑`
- `↓`
- `←`
- `→`
- `Select / OK`
- `Return`

Mouse, teclado físico, touchpad e ponteiro são complementares, nunca requisitos.

### 2.3 Focus is location

O foco informa onde o usuário está.

- somente um item pode receber foco por vez;
- foco não pode depender apenas de mudança de cor;
- foco combina borda, escala e sombra;
- o usuário deve prever para onde cada seta levará;
- ao retornar de Detalhes/Modal/Player, restaurar o foco anterior quando possível.

### 2.4 Reduce workload

TV é contexto de relaxamento. O sistema deve reduzir carga cognitiva.

Aplicar **progressive disclosure**:

- detalhes técnicos sob demanda;
- teclados somente quando solicitados;
- integrações BYOK fora da Home;
- player chrome escondido durante reprodução;
- informações de rede e APIs em status compacto.

---

## 3. Perfil de compatibilidade Samsung Tizen

O V13 adota um perfil conservador de Web App.

| Recurso | Status no DS | Regra |
|---|---|---|
| HTML/CSS/JS standalone | Preferido | Sem CDN, framework ou webfont obrigatória |
| CSS `transform` / `opacity` | Preferido | Usar em foco e transições curtas |
| CSS Grid + Flexbox | Permitido | Layouts alinhados e previsíveis |
| SVG inline / assets locais | Preferido | Ícones críticos e shell local |
| `backdrop-filter` pesado | Evitar | Preferir superfícies opacas/translúcidas simples |
| filtros CSS complexos permanentes | Evitar | Usar somente quando indispensável |
| GIF animado | Evitar | Preferir CSS ou mídia otimizada |
| DOM com milhares de cards | Proibido em produção | Virtualizar listas e grades extensas |
| recursos remotos para UI base | Evitar | Shell deve continuar funcional offline |
| webfont obrigatória | Evitar | Arial/Helvetica como base previsível |
| `:has()` como requisito | Evitar | Preferir classes explícitas |
| `document.write()` | Evitar | Construção DOM explícita |
| animação via APIs não essenciais | Evitar | Preferir classes + CSS transitions |
| Samsung IME / inputs HTML | Preferido | Busca e configuração textual usam o teclado nativo |
| `inputmode` / `autocomplete` | Preferido | Descrever corretamente search, URL, usuário e senha |
| ARIA / `aria-label` / `aria-live` | Preferido | Base para Voice Guide e anúncios de estado |
| `visibilitychange` | Obrigatório para lifecycle | Suspender previews/timers e restaurar contexto no resume |
| `navigator.onLine` + eventos online/offline | Permitido como sinal | Usar junto da verificação real de requests/stream |
| `KeyboardEvent.repeat` | Preferido | Detectar long press e evitar disparos caros durante navegação rápida |
| media keys Tizen | Preferido no player | Registrar e mapear Play/Pause/FF/RW/Stop conforme disponibilidade |

### 3.1 JavaScript

Preferir sintaxe e APIs conservadoras quando o componente não precisa de recursos modernos.

Padrões recomendados:

```js
var items = Array.prototype.slice.call(document.querySelectorAll('.focusable'));
```

Evitar depender de uma única API recente sem fallback.

### 3.2 Media keys

Teclas básicas de navegação não exigem registro adicional no design.

Teclas de mídia podem ser registradas quando disponíveis:

```js
if (window.tizen && tizen.tvinputdevice) {
  var keys = [
    'MediaPlayPause',
    'MediaPlay',
    'MediaPause',
    'MediaFastForward',
    'MediaRewind',
    'MediaStop'
  ];
}
```

---

## 4. Canvas e safe zone

### 4.1 Canvas lógico

- base: `1920 × 1080 px`;
- proporção: 16:9;
- app escalado proporcionalmente para a viewport;
- layouts nunca dependem da resolução física exata do painel.

### 4.2 Safe content zone

O Component Lab usa como referência visual:

- aproximadamente **5%** de margem horizontal;
- aproximadamente **7%** de margem vertical.

Em 1920×1080 isso representa aproximadamente:

- horizontal: 96 px;
- vertical: 76 px.

O padding mínimo de implementação pode ser menor em determinadas telas, porém **texto crítico, botões principais e labels essenciais não devem ficar colados às bordas**.

### 4.3 Shell

O shell deve preservar:

- fundo preto profundo;
- navegação superior quando aplicável;
- conteúdo dentro da safe zone;
- overlays acima do conteúdo sem criar múltiplas camadas fullscreen simultâneas.

---

## 5. Tokens de cor V14

### 5.1 Superfícies

| Token | Valor | Uso |
|---|---:|---|
| `--bg-canvas` | `#05060A` | canvas mais profundo |
| `--bg-base` | `#0B0D12` | fundo principal |
| `--bg-surface` | `#15181F` | cards e painéis |
| `--bg-elevated` | `#1D212B` | superfícies elevadas / inputs |
| `--bg-hover` | `#2A2F3C` | superfície focada / hover de browser |

### 5.2 Texto

| Token | Valor | Uso |
|---|---:|---|
| `--text-primary` | `#F5F6F8` | texto principal |
| `--text-secondary` | `#A7ADBB` | texto secundário |
| `--text-disabled` | `#5C6372` | indisponível / baixa prioridade |
| annotation/lab | `#7C8494` | documentação e metadata secundária |

### 5.3 Accent

| Token | Valor | Uso |
|---|---:|---|
| `--accent` | `#FF7A3D` | ação primária, foco, progresso, seleção |
| `--accent-light` | `#FFA36B` | foco/hover de ação primária |
| `--accent-pressed` | `#D9601F` | pressed |
| `--accent-tint` | `rgba(255,122,61,.16)` | fundo selecionado |

### 5.4 Gradiente da marca

```css
linear-gradient(
  92deg,
  #FF2E87 0%,
  #FF7A3D 26%,
  #FFC93D 50%,
  #3DDC84 72%,
  #1E9AB0 100%
)
```

Usar apenas em:

- wordmark;
- ícone;
- splash;
- decoração pontual;
- estados de marca muito específicos.

Não usar em:

- texto de corpo;
- metadata;
- botões comuns;
- todos os cards simultaneamente.

### 5.5 Semântica adicional

- `#3DDC84` — sucesso/conectado;
- `#FFC93D` — aviso;
- `#2DB8C4` / `#1E9AB0` — informação técnica;
- `#FF2E87` — live/destaque de transmissão;
- vermelho dedicado continua permitido para erro/destrutivo quando necessário.


---

## 6. Tipografia V14

### Família de títulos

```css
font-family: 'Poppins', Arial, Helvetica, sans-serif;
```

### Família de interface e leitura

```css
font-family: 'Inter', Arial, Helvetica, sans-serif;
```

### Escala canônica de produto

| Papel | Tamanho | Peso | Família |
|---|---:|---:|---|
| Display | 64 px | 800 | Poppins |
| H1 / tela | 40 px | 700 | Poppins |
| H2 / seção/card | 28 px | 600 | Inter |
| Body large / sinopse | 24 px | 500 | Inter |
| Body / labels | 20 px | 500 | Inter |
| Caption / timestamp | 16 px | 600 | Inter |

### Regras

- **16 px é o mínimo de texto de produto** nesta direção visual;
- anotações internas do Component Lab podem ser menores, mas não representam UI final;
- Poppins concentra personalidade nos títulos;
- Inter concentra legibilidade e densidade operacional;
- evitar excesso de pesos;
- caixa alta apenas em kicker/status curto;
- texto secundário usa `#A7ADBB`, não cinzas de contraste insuficiente.


---

## 7. Espaçamento V14

Grid base:

`8, 16, 24, 32, 48, 64, 96 px`

### Uso

- 8 px — micro gap;
- 16 px — controles relacionados;
- 24 px — interior de cards/painéis;
- 32 px — grupos;
- 48 px — blocos maiores;
- 64 px — separação de seções;
- 96 px — safe margin de referência em 1920×1080.

Evitar valores arbitrários quando um múltiplo de 8 resolve.


---

## 8. Radius V14

| Token | Uso |
|---:|---|
| `8 px` | botão retangular compacto / tags |
| `12 px` | input / painéis técnicos pequenos |
| `16 px` | cards e superfícies principais |
| `999 px` | botão primário, pills, chips e status |

A identidade visual usa menos variações de radius do que a V13.


---

## 9. Elevação

Elevação deve ajudar hierarquia, não virar decoração permanente.

### Level 1

```css
box-shadow: 0 8px 24px rgba(0,0,0,.28);
```

### Level 2

```css
box-shadow: 0 16px 48px rgba(0,0,0,.48);
```

### Level 3

```css
box-shadow: 0 24px 70px rgba(0,0,0,.62);
```

Usos:

- Level 1: cards flutuantes discretos;
- Level 2: foco / navegação;
- Level 3: modal e overlay crítico.

---

## 10. Motion

### Easing

```css
--ease: cubic-bezier(.2,.8,.2,1);
```

### Durações

| Token lógico | Duração | Uso |
|---|---:|---|
| Fast | 120–160 ms | foco / pressed |
| Standard | 180–240 ms | modal / troca de estado |
| Slow | 280–420 ms | hero / contexto |

### Regras

- animar prioritariamente `transform` e `opacity`;
- não animar layout continuamente;
- cancelar previews quando o foco muda;
- reduced motion deve desativar transições não essenciais.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *:before, *:after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

O app também pode oferecer preferência interna para engines que não respeitam a media query.

---

## 11. Foco e controle remoto

### 11.1 Focus ring canônico V14

```css
.focusable:focus,
.focusable.focused {
  outline: 4px solid #FF7A3D;
  outline-offset: 3px;
  box-shadow:
    0 0 0 8px rgba(255,122,61,.22),
    0 0 40px rgba(255,122,61,.55);
  transform: scale(1.06);
  transition:
    transform 140ms ease-out,
    box-shadow 140ms ease-out;
}
```

Para botão primário em foco:

- fundo pode subir para `#FFA36B`;
- texto permanece escuro;
- outline continua laranja;
- não adicionar gradiente completo da marca.

### 11.2 No-scale

Rows, EPG, opções, tabelas e componentes que não podem alterar geometria usam:

```css
.no-scale.focused,
.no-scale:focus {
  transform: none;
}
```

### 11.3 Pressed

Pressed é curto e tátil:

```css
.pressed {
  transform: scale(.985);
}
```

Duração aproximada: **140 ms**.

### 11.4 Disabled

A V13 separa dois padrões:

#### Soft disabled

Use quando a ação está indisponível **mas a explicação é útil**.

- permanece focável;
- `Select/OK` explica o motivo ou como habilitar;
- visual reduzido em repouso;
- recupera contraste quando focado;
- exemplo: áudio-descrição ausente no stream, episódio anterior no primeiro episódio.

#### Hard disabled

Use quando a ação não faz sentido no contexto e não existe informação útil adicional.

- não recebe foco;
- `aria-disabled="true"` quando aplicável;
- opacity reduzida;
- exemplo: velocidade de reprodução em TV ao vivo.

Nunca usar apenas cor para comunicar indisponibilidade.

### 11.5 Navegação espacial

O algoritmo deve:

1. considerar somente candidatos na direção pressionada;
2. priorizar menor distância principal;
3. penalizar grande deslocamento perpendicular;
4. evitar saltos diagonais inesperados;
5. não criar loop automático no começo/fim de listas, salvo padrão explícito.

### 11.6 Return

Return fecha o nível atual:

- modal → tela anterior;
- detalhe → card de origem;
- EPG → Live TV;
- player → contexto anterior;
- Home → confirmação de saída quando necessário.

---

## 12. Estados de interação

Todo componente interativo deve definir:

### Default

Estado em repouso.

### Focused

- ring visível;
- contraste elevado;
- escala apenas quando segura.

### Pressed

Feedback rápido após OK.

### Disabled

Ação indisponível e não navegável.

### Loading

Ação ocupada com feedback claro.

### Error

Mensagem + possível ação corretiva.

---

## 13. Navigation patterns

### 13.1 Top navigation

Usar quando houver poucos destinos principais.

Destinos atuais:

- Início;
- TV ao vivo;
- Filmes;
- Séries;
- Esportes;
- Infantil.

Ações globais ficam à direita:

- IA;
- Busca;
- Configurações / perfil.

### 13.2 Side navigation

Usar quando as categorias são numerosas ou dinâmicas.

Exemplos:

- categorias de filmes;
- categorias de séries;
- grupos de canais;
- settings.

#### Categorias pessoais fixas

As categorias pessoais ficam **fixadas no topo** da lista de categorias e são sempre visíveis, mesmo quando vazias.

**Canais**

1. `★ Favoritos`
2. `Todos`
3. categorias/grupos da fonte IPTV

**Filmes**

1. `★ Favoritos`
2. `↺ Histórico`
3. `Todos`
4. categorias editoriais/dinâmicas

**Séries**

1. `★ Favoritos`
2. `↺ Histórico`
3. `Todos`
4. categorias editoriais/dinâmicas

Regras:

- `Favoritos` existe em **Canais, Filmes e Séries**;
- `Histórico` existe em **Filmes e Séries**;
- ambas são por perfil;
- não esconder a categoria quando vazia;
- usar empty state instrutivo em vez de remover a opção;
- categorias dinâmicas da fonte/provedor entram **depois** das categorias pessoais fixas.

### 13.3 Favoritos e Histórico

#### Favoritos

`Favoritos` representa intenção explícita do usuário.

- adicionar/remover por ação de estrela/coração equivalente;
- persistência por perfil;
- disponível em Canais, Filmes e Séries;
- ordenação padrão: mais recentemente favoritado, salvo decisão editorial diferente;
- pode ser usado pela curadoria IA como sinal positivo, sem transformar o favorito em recomendação automática obrigatória.

#### Histórico

`Histórico` registra conteúdo reproduzido anteriormente.

- disponível somente em Filmes e Séries;
- ordenação padrão: última reprodução primeiro;
- pode conter itens concluídos e itens parcialmente reproduzidos;
- ação de limpeza deve existir em Configurações/Privacidade ou Perfil;
- limpar Histórico não remove Favoritos;
- remover um item do Histórico não deve remover o progresso salvo, a menos que o usuário escolha explicitamente apagar também o progresso.

#### Histórico × Continue Assistindo

São conceitos diferentes:

- **Continue Assistindo:** conteúdo com progresso incompleto e ação clara de retomar;
- **Histórico:** registro cronológico do que foi reproduzido, incluindo itens concluídos.

Um mesmo título pode aparecer simultaneamente em `Histórico` e `Continue Assistindo` enquanto estiver incompleto.

### 13.4 Tabs

Usar para seções irmãs curtas:

- Episódios;
- Detalhes;
- Elenco;
- Semelhantes.

Tabs não devem substituir navegação profunda.

---

## 14. Buttons, chips, icons e tooltips

### Primary button

- fundo branco;
- texto escuro;
- uma ação principal por contexto.

### Accent button

- gradiente coral;
- reservado a ações especiais, como IA ou confirmação relevante.

### Ghost button

- superfície escura discreta;
- ações secundárias.

### Chips

- filtros curtos;
- estado selected claramente distinto;
- não usar dezenas de chips quando uma side navigation funciona melhor.

### Icon buttons

- tamanho alvo ~52 × 52 px;
- SVG local;
- rótulo no foco quando o significado não for óbvio.

### Tooltips

Somente para complementar ícones compactos.

Nunca esconder funcionalidade essencial atrás de hover.

---

## 15. Iconografia

Ícones críticos usam SVG/local assets com stroke consistente.

Família mínima:

- Play;
- Pause;
- Search;
- Add;
- Next;
- Back;
- Menu;
- Device;
- Settings;
- Audio;
- Subtitles;
- Quality;
- Info;
- Favorite;
- Live.

Evitar emoji ou glyphs do sistema como elemento principal, porque variam entre engines e versões de TV.

---

## 16. Content cards

### 16.1 Landscape

Referência:

- `292 × 164 px`;
- Continue Assistindo;
- Live TV;
- recomendações horizontais.

### 16.2 Portrait

Referência:

- `205 × 302 px`;
- Filmes;
- Séries;
- Minha Lista.

### 16.3 Wide

Referência histórica do produto:

- `356 × 200 px`;
- destaques especiais.

### 16.4 Compact

Referência V12:

- `250 × 126 px`;
- canais / módulos compactos.

### 16.5 Anatomia

Um card pode conter:

- artwork;
- kicker;
- título;
- metadata;
- badge;
- favorito;
- progress bar;
- estado AO VIVO;
- trailer preview sob demanda.

### 16.6 Regras

- não misturar proporções sem alinhamento claro;
- metadata deve ser curta;
- card focado pode revelar informação adicional;
- não colocar muitos ícones simultaneamente sobre artwork.

---

## 17. Rails e indicadores de posição

Quando existe conteúdo fora da viewport, o usuário precisa perceber que há continuação.

Padrões:

- edge fade discreto;
- indicador de posição;
- foco desloca a rail;
- setas visuais opcionais como affordance para mouse, nunca requisito do controle.

### Virtualização

Rails grandes em produção devem montar apenas:

- viewport atual;
- pequeno buffer anterior;
- pequeno buffer posterior.

---

## 18. Inputs e preferências

### 18.1 Regra principal

Digitação longa no controle remoto é fallback.

Priorizar:

- pareamento por celular;
- QR code;
- voice input;
- sugestões prontas;
- teclado nativo do Tizen quando disponível.

### 18.2 Casos de uso

- servidor Xtream;
- usuário;
- senha;
- URL M3U;
- XMLTV EPG;
- API keys BYOK.

### 18.3 Error state

Erro precisa indicar:

- o que falhou;
- o que revisar;
- ação de testar novamente.

### 18.4 Preferences

Exemplos:

- autoplay de trailer;
- reduzir movimento;
- qualidade automática;
- delay de legenda;
- formato da tela.

---

## 19. Loading, empty, offline e errors

### 19.1 Spinner

Tamanhos usuais:

- 20 px;
- 32 px;
- 48 px.

Uso:

- teste de API;
- sincronização EPG;
- trailer;
- IA;
- catálogo;
- stream.

### 19.2 Skeleton

Usar somente quando a estrutura final é conhecida.

Regras:

- preservar tamanho final;
- evitar layout shift;
- shimmer simples;
- em hardware antigo, preferir pulse de opacity.

### 19.3 Empty state

Deve conter:

- ícone simples;
- causa;
- ação recomendada.

Exemplo:

> Minha Lista está vazia. Adicione filmes e séries para encontrar tudo aqui.

### 19.4 Offline state

> Sem conexão. Verifique a rede ou execute o diagnóstico de internet.

Ação: `Testar conexão`.

### 19.5 Playback error

> Não foi possível reproduzir. O stream não respondeu.

Ações:

- Tentar novamente;
- Voltar;
- escolher outro canal.

---

## 20. Home service dock

Status de serviços ficam compactos na Home.

Serviços atuais:

- WeatherAPI;
- Cloudflare Speed Test;
- TMDB;
- DeepSeek.

### Comportamento

- por padrão, mostrar apenas ícone/estado;
- detalhes aparecem no foco;
- nunca competir com hero;
- dock deve ser secundário visualmente.

---

## 21. Integrações & BYOK

### 21.1 Estrutura do card

Cada integração exibe:

- provedor;
- descrição;
- status;
- credential/token mascarado, quando aplicável;
- capabilities;
- Testar;
- Editar/Configurar.

### 21.2 TMDB

Funções de UX:

- metadata;
- ratings;
- posters;
- backdrops;
- trailers;
- cast;
- trending;
- recomendações.

Capabilities:

- `TRAILERS`
- `RATINGS`
- `CAST`
- `TRENDING`

### 21.3 WeatherAPI

Funções:

- condição atual;
- previsão;
- alertas;
- localização aproximada configurável.

Capabilities:

- `CURRENT`
- `FORECAST`
- `ALERTS`

### 21.4 DeepSeek / agente

Funções:

- recommendation;
- explanation;
- voice intent;
- curadoria contextual.

Regra de segurança:

**secure relay/backend é preferido** para não manter segredo sensível no JavaScript/localStorage da TV.

### 21.5 Cloudflare Speed Test

Não exige chave no design padrão.

Métricas:

- download;
- upload;
- ping;
- jitter.

O teste deve ser iniciado pelo usuário para evitar consumo desnecessário de banda.

---

## 22. Trailer preview on focus

Trailer é um comportamento contextual, nunca autoplay agressivo.

### Regras

- inicia após aproximadamente **850 ms** de foco estável;
- começa sem áudio;
- qualquer movimento cancela o timer;
- backdrop permanece estável antes do delay;
- OK abre Detalhes ou ação principal;
- se o item sair de foco, liberar/preparar mídia conforme estratégia de cache.

### Provider label

Quando aplicável:

`TMDB TRAILER • SEM ÁUDIO`

---

## 23. AI recommendation

IA deve funcionar como **curadoria por intenção**, não como chat obrigatório.

### Intenções rápidas

Exemplos:

- Me surpreenda;
- Algo leve;
- Suspense inteligente;
- Até 2 horas;
- Série curta;
- Para ver em família.

### Recommendation card

Deve comunicar:

- título;
- compatibilidade/match;
- motivo;
- ação para abrir;
- feedback opcional.

### Explicabilidade

Exemplos de motivos:

- gênero compatível;
- duração disponível;
- histórico;
- favoritos;
- conclusão de séries semelhantes;
- diversidade em relação ao histórico recente.

### Feedback

- Gostei;
- Menos assim.

Feedback pode alimentar recomendações futuras por perfil.

---

## 24. Fontes IPTV & EPG

### 24.1 Source row

Cada fonte mostra:

- identidade;
- tipo (`Xtream` / `M3U`);
- quantidade de conteúdo;
- estado de sincronização;
- estado do EPG;
- Editar;
- Sincronizar;
- EPG / Adicionar EPG.

### 24.2 EPG independente da playlist

EPG deve ser configurável sem recriar a fonte IPTV.

Configurações possíveis:

- URL XMLTV;
- matching por `tvg-id`;
- fuso horário;
- frequência de atualização;
- sincronização manual;
- status.

### 24.3 Estados de fonte

- Sincronizada;
- Sincronizando;
- Erro;
- Credencial inválida;
- EPG vinculado;
- EPG não configurado.

---

## 25. Live TV

Arquitetura canônica:

**Categorias → Canais → Preview / Programação**

### Categoria Favoritos

`★ Favoritos` é a primeira categoria fixa de TV ao vivo.

Ordem recomendada:

1. `★ Favoritos`;
2. `Todos`;
3. Canais abertos;
4. grupos/categorias fornecidos pela fonte, como Telecine, Premiere, SporTV, Notícias, Infantil etc.

Regras:

- favoritar/desfavoritar canal deve produzir feedback imediato;
- categoria permanece visível quando vazia;
- estado vazio orienta o usuário a usar a ação de favorito no canal;
- Favoritos pertence ao perfil ativo;
- EPG e zapping continuam funcionando normalmente dentro de Favoritos.


### Channel item

Mostrar:

- número do canal;
- logo;
- nome;
- programa atual;
- progresso do programa.

### Preview

- maior que painéis auxiliares;
- atualiza após foco estável;
- estado loading antes de troca real;
- OK entra fullscreen;
- `↑/↓` no player Live faz zapping.

### Guia

`Guia completo` abre EPG fullscreen.

---

## 26. EPG

### 26.1 Estrutura

- coluna de canal;
- timeline horizontal;
- programas com largura proporcional quando possível;
- marcador explícito de programa atual;
- dia atual / dias seguintes;
- linha de hora atual em fullscreen.

### 26.2 Foco

EPG usa componentes `.no-scale` para evitar distorcer a grade.

O item focado deve mostrar:

- título;
- horário;
- estado `Agora` quando aplicável.

### 26.3 Dias

Padrão:

- Hoje;
- Amanhã;
- próximo dia útil exibido pelo produto.

---

## 27. Player & stream controls

### 27.1 Chrome

O chrome aparece após interação e desaparece durante reprodução contínua.

VOD e Live compartilham:

- play/pause;
- áudio;
- legendas;
- qualidade;
- info stream.

### 27.2 VOD-only

- rewind/forward;
- velocidade;
- timeline completa;
- continue progress.

### 27.3 Live-only

- live bug;
- zapping;
- canal;
- programa atual;
- guia.

Velocidade não aparece em Live TV.

### 27.4 Áudio e legendas

O modal deve permitir:

- faixa de áudio;
- legenda;
- Off;
- idiomas disponíveis;
- ajuste de sincronização.

Delay de referência:

- `-1000 ms`
- `-500 ms`
- `0 ms`
- `+500 ms`
- `+1000 ms`

### 27.5 Qualidade

Padrões:

- Auto;
- 2160p;
- 1080p;
- 720p;
- resoluções inferiores quando necessário.

Auto é o padrão.

### 27.6 Velocidade VOD

Faixa prevista:

- 0.5×;
- 0.75×;
- 1.0×;
- 1.25×;
- 1.5×;
- 2.0×.

### 27.7 Aspect ratio

- Ajustar;
- Preencher;
- Original;
- Zoom.

### 27.8 Stream info

Pode exibir:

- resolução;
- codec;
- FPS;
- bitrate;
- buffer;
- protocolo;
- faixa de áudio;
- status da rede.

---

## 28. Modais

### 28.1 Hierarquia

Modal fica na camada de overlay (`z-index` lógico 100).

### 28.2 Performance

- sem backdrop blur pesado;
- fundo escuro opaco/translúcido;
- um modal por vez;
- restaurar foco ao fechar.

### 28.3 Usos

- áudio/legenda;
- qualidade;
- ordenação;
- temporada;
- busca;
- BYOK;
- editor de fonte;
- EPG;
- confirmação.

---

## 29. Layers & z-index

Hierarquia lógica:

| Layer | Uso |
|---:|---|
| 0 | Background / backdrop |
| 10 | Content / rails / grids / EPG |
| 50 | Navigation / topbar / sidenav |
| 100 | Overlay / modal / toast / player chrome |

Evitar empilhar superfícies fullscreen sem necessidade.

---

## 30. Performance budget

### 30.1 DOM

**Windowed / virtualized.**

Catálogos extensos montam somente viewport + buffer.

### 30.2 Imagens

**Display-size.**

Não carregar imagem 4K para card de 205×302.

### 30.3 Animação

**Transform / opacity.**

Evitar:

- layout thrash;
- filtros permanentes;
- sombras excessivas em centenas de cards;
- `will-change` em todo o catálogo.

### 30.4 Lifecycle

Quando o app fica oculto:

- pausar timers;
- cancelar trailers/previews;
- liberar mídia pesada;
- reduzir listeners/loops desnecessários;
- persistir estado essencial.

### 30.5 GPU layers

Não aplicar indiscriminadamente:

```css
translateZ(0)
will-change: transform
```

Promoção permanente de camadas pode aumentar memória/GPU.

---

## 31. Accessibility & comfort

### Reduced motion

Respeitar preferência de redução de movimento.

### Contrast

Foco usa:

- borda;
- escala quando segura;
- sombra;
- contraste.

Não depender só de cor.

### Labels

Ícones sem texto precisam de label/tooltip no foco.

### Audio/Subtitles

Devem ser acessíveis sem sair do player.

### Safe reading

- evitar parágrafos longos;
- largura confortável;
- metadata curta;
- hierarquia forte.

### Privacy

- perfil ativo claramente indicado;
- API keys mascaradas;
- segredo do agente preferencialmente fora do cliente;
- nunca exibir credenciais completas em status da Home.

---

## 31.1 Regras visuais dos componentes V14

### Botão primário

- altura de referência: 64 px;
- fundo: `#FF7A3D`;
- texto: escuro (`#2A1206`);
- radius: pill;
- foco: `#FFA36B` + focus ring V14.

### Botão secundário

- fundo: `#1D212B`;
- borda: `#2A2F3C`;
- texto: `#F5F6F8`;
- pode ser pill ou 12–16 px dependendo do contexto.

### Cards

- base: `#15181F`;
- elevated/focused: `#1D212B` / `#2A2F3C`;
- radius: 16 px;
- progress: laranja;
- evitar aplicar o gradiente da marca como fundo genérico de catálogo.

### Inputs

- base: `#15181F` ou `#1D212B`;
- radius: 12 px;
- foco: borda/outline laranja;
- ícone de teclado pode aparecer no foco quando abrir teclado virtual/IME.

### Seleção

Chips, tabs e categorias selecionadas usam:

```css
background: rgba(255,122,61,.16);
color: #FF7A3D;
border-color: rgba(255,122,61,.40);
```

---

## 32. Templates de tela

### Splash

- marca central;
- tagline curta;
- loader discreto;
- sem navegação.

### Perfis

- foco em “Quem está assistindo?”;
- configuração IPTV secundária;
- nenhum painel técnico competindo com perfis.

### Home

Ordem recomendada:

1. hero;
2. Continue Assistindo;
3. Minha Lista quando houver itens;
4. Agora na TV;
5. Curadoria IA;
6. Top / trending;
7. recomendações.

Status BYOK aparece como dock compacto.

### Filmes / Séries

- side categories;
- `★ Favoritos` fixo no topo;
- `↺ Histórico` fixo logo abaixo de Favoritos;
- `Todos` depois das categorias pessoais;
- busca sob demanda;
- ordenação discreta;
- hero/contexto;
- rails;
- categorias podem recolher quando foco entra no conteúdo.

#### Estado vazio

**Favoritos vazio**

> Adicione filmes ou séries aos Favoritos para encontrá-los rapidamente aqui.

**Histórico vazio**

> Os filmes e séries reproduzidos neste perfil aparecerão aqui.

Favoritos e Histórico não desaparecem quando vazios.

### Busca

- voz e sugestões primeiro;
- recentes e tendências;
- teclado somente sob demanda.

### Detalhe de filme

- hero;
- metadata;
- Assistir;
- Minha Lista;
- Trailer;
- sinopse;
- dados técnicos;
- semelhantes.

### Detalhe de série

- hero;
- continuar episódio;
- seletor de temporada;
- episódios 16:9;
- progresso/concluído.

### Configurações

Seções:

- Perfil;
- Fontes;
- Integrações & BYOK;
- Reprodução;
- parental;
- aparência/acessibilidade.

---

## 33. Predictable focus path

Layouts precisam usar vizinhos claros.

Preferir:

```text
A → B → C
↓   ↓   ↓
D → E → F
```

Evitar layouts em que pressionar `↓` salta para item distante ou diagonal.

Para componentes complexos, definir grupos explícitos de navegação quando o algoritmo geométrico não for suficiente.

---

## 34. Tizen QA matrix

Cada componente novo precisa ser aprovado em três dimensões.

### Remote

- todos os itens acessíveis por setas;
- Select executa ação esperada;
- Return fecha nível atual;
- sem loop acidental em início/fim;
- foco nunca desaparece;
- foco retorna ao item anterior após modal/detalhe.

### Visual

- um único foco por vez;
- foco visível sem depender de cor;
- indicador de overflow quando necessário;
- sem sobreposição durante repetição rápida;
- textos legíveis a distância;
- sem layout shift ao carregar.

### Performance

- assets locais no shell;
- sem GIF animado para UI;
- sem backdrop blur pesado;
- listas extensas virtualizadas;
- imagens no tamanho de uso;
- trailers cancelados ao perder foco;
- teste em hardware real.

---

## 35. Do / Avoid

### Faça

- use grid/fila com vizinhos claros;
- revele detalhes sob demanda;
- preserve foco ao voltar;
- mostre feedback para operações lentas;
- mantenha uma ação principal evidente;
- use SVG local para ícones;
- virtualize catálogos extensos;
- masque credenciais;
- teste com Smart Remote e hardware real.

### Evite

- teclado virtual permanente;
- texto pequeno;
- excesso de metadata;
- foco apenas por cor;
- hover obrigatório;
- milhares de cards no DOM;
- status técnico competindo com hero;
- webfont obrigatória;
- efeitos pesados em todas as superfícies;
- player chrome permanentemente visível.

---

## 36. CSS canônico V13

```css
:root {
  --outer: #020305;
  --bg: #05070b;
  --surface: #0b1017;
  --surface-2: #101722;
  --surface-3: #151d29;

  --text: #f6f8fc;
  --text-2: #c8d2df;
  --muted: #94a0b3;
  --muted-2: #6f7d91;

  --accent: #ff5264;
  --accent-2: #ff6d57;
  --info: #62d7ff;
  --blue: #4ca3ff;
  --success: #59d99a;
  --warning: #ffb36c;
  --danger: #ff4f68;
  --live: #ff3d5f;
  --focus: #ffffff;

  --r8: 8px;
  --r10: 10px;
  --r12: 12px;
  --r14: 14px;
  --r16: 16px;
  --r18: 18px;
  --r22: 22px;

  --ease: cubic-bezier(.2,.8,.2,1);

  --focus-ring:
    0 0 0 2px #fff,
    0 14px 42px rgba(0,0,0,.58),
    0 0 24px rgba(255,82,100,.12);
}

body {
  font-family: Inter, Arial, Helvetica, sans-serif;
  background: var(--outer);
  color: var(--text);
}

.focusable {
  outline: 0;
  transition:
    transform .14s var(--ease),
    box-shadow .14s var(--ease),
    background .14s var(--ease),
    border-color .14s var(--ease),
    opacity .14s var(--ease);
}

.focusable.focused,
.focusable:focus {
  box-shadow: var(--focus-ring);
  transform: scale(1.05);
  border-color: rgba(255,255,255,.9);
  position: relative;
  z-index: 5;
}

.no-scale.focused,
.no-scale:focus {
  transform: none;
}
```

---

---

## 37. Samsung IME e entrada de texto

### 37.1 Regra principal

O aplicativo **não deve manter um teclado virtual próprio como mecanismo primário** para texto livre.

Usar inputs HTML que acionem o IME da Samsung no Tizen:

```html
<input inputmode="search" aria-label="Pesquisar filmes e séries">
<input inputmode="url" aria-label="URL da playlist M3U">
<input autocomplete="username" aria-label="Usuário Xtream">
<input type="password" autocomplete="current-password" aria-label="Senha Xtream">
```

### 37.2 Fluxos que usam IME

- busca global;
- busca em Filmes;
- busca em Séries;
- URL M3U;
- servidor Xtream;
- usuário e senha;
- URL XMLTV/EPG;
- API keys BYOK;
- prompt textual da IA quando necessário.

### 37.3 Next / Done

Formulários com vários campos devem permitir sequência previsível:

`Servidor → Usuário → Senha → Done`

A ação **Next** move foco para o próximo campo. **Done/Enter** conclui ou aplica.

### 37.4 Pareamento por celular

Para URLs, tokens e credenciais longas, **pareamento por celular continua sendo a experiência preferida**. IME é alternativa nativa, não justificativa para transformar a TV em formulário web.

---

## 38. Voice Guide, ARIA e anúncios

### 38.1 Nome acessível

Todo item focável precisa fazer sentido sem depender apenas do layout visual.

Exemplo de card:

```html
<div
  role="button"
  aria-label="Horizonte Zero, série, episódio 3, 31 por cento assistido">
</div>
```

### 38.2 O que anunciar

Cards de conteúdo devem priorizar:

- título;
- tipo;
- estado relevante;
- progresso, quando houver;
- ação ou indisponibilidade importante.

Não anunciar sinopses inteiras durante navegação por cards.

### 38.3 `aria-live`

Usar região de anúncio para mudanças relevantes, por exemplo:

- conexão restaurada;
- fonte sincronizada;
- EPG concluído;
- explicação de soft disabled;
- erro e ação corretiva;
- mudança de canal confirmada.

Preferir `aria-live="polite"` para não interromper o usuário sem necessidade.

### 38.4 Configuração

Configurações > Acessibilidade & sistema deve incluir:

- Voice Guide/anúncios;
- reduzir movimento;
- alto contraste;
- aparência das legendas;
- teste de anúncio de foco.

---

## 39. Legendas acessíveis

### 39.1 Configuração mínima

Além de idioma e delay, a V13 define:

- tamanho: Pequeno / Médio / Grande;
- cor: Branco / Amarelo / Cyan;
- fundo: Sem fundo / Preto 60% / Preto 85%;
- edge: Sem contorno / Contorno / Sombra;
- sincronização: `-1000 / -500 / 0 / +500 / +1000 ms`.

### 39.2 Preview

A tela de configuração precisa mostrar uma **prévia real da legenda** enquanto o usuário muda aparência.

### 39.3 Preferências da TV

Quando o Tizen/TV expuser preferências de caption, a implementação deve considerá-las e evitar sobrescrevê-las silenciosamente.

### 39.4 Áudio-descrição

Áudio-descrição é um ótimo caso de **soft disabled**:

- aparece na interface;
- pode receber foco;
- se a faixa não existir, Select explica que o conteúdo atual não oferece áudio-descrição.

---

## 40. Rede e lifecycle

### 40.1 Estados

O sistema deve representar explicitamente:

- `online`;
- `offline`;
- `suspenso`;
- `retomado`;
- `verificando rede`;
- `reconectando stream`.

### 40.2 Ao ficar oculto

Em `visibilitychange` com `document.hidden = true`:

- cancelar trailer-preview;
- cancelar preview de canal;
- pausar timers;
- suspender mídia auxiliar;
- persistir estado/foco essencial;
- evitar novas chamadas BYOK/TMDB/Weather.

### 40.3 Ao retomar

Sequência recomendada:

`resume → verificar rede → restaurar estado → restaurar foco → retomar player quando seguro`

Não retomar automaticamente um stream se a conexão ainda estiver indisponível.

### 40.4 Offline

O banner offline deve:

- explicar o estado;
- preservar navegação em conteúdo cacheado/local;
- bloquear apenas ações dependentes de internet;
- oferecer `Tentar novamente`;
- sumir quando a conexão for restabelecida.

`navigator.onLine` é um sinal inicial; sucesso real de requests/stream continua sendo a verificação final.

---

## 41. Memória de foco por área

A memória de foco da V13 é contextual, não apenas por tela.

Chaves recomendadas:

```text
movies:favorites
movies:history
movies:Ação
movies:Drama
series:favorites
series:history
series:Originais
series:Crime
live:favorites
live:Esportes
live:Telecine
```

### Regras

- voltar de Detalhes restaura o card de origem;
- trocar para outra categoria abre o foco inicial apropriado dessa categoria;
- retornar posteriormente à categoria pode restaurar sua última posição;
- Favoritos e Histórico mantêm memória de foco própria por perfil;
- EPG retorna ao canal/programa de origem quando possível;
- modal retorna ao controle que o abriu.

Evitar “teleportar” o foco para o início da tela sem motivo.

---

## 42. Long press, key repeat e previews

### 42.1 Detecção

Usar `KeyboardEvent.repeat` quando disponível para identificar navegação contínua.

### 42.2 Durante navegação rápida

Cancelar ou impedir:

- trailer-preview;
- preview de canal;
- chamadas de metadata por foco;
- recomendações disparadas pelo item transitório.

### 42.3 Quando o foco estabiliza

Reativar delays normais:

- canal: ~520 ms;
- trailer: ~850 ms.

### 42.4 Objetivo

Segurar `→` precisa mover rapidamente pelo rail **sem iniciar cinco trailers no caminho**.

---

## 43. Smart Remote e media keys

### 43.1 Play/Pause

Quando o usuário pressiona a tecla física:

1. alternar reprodução;
2. revelar OSD/player chrome;
3. posicionar foco no controle Play/Pause;
4. reiniciar timer de auto-hide.

### 43.2 Séries

Player de série pode oferecer:

- episódio anterior;
- rewind 10 s;
- Play/Pause;
- forward 10 s;
- próximo episódio.

Primeiro/último episódio usam soft disabled para explicar o limite.

### 43.3 Live TV

- `↑/↓`: zapping;
- Guia: abre EPG;
- velocidade de reprodução: hard disabled/ausente;
- Play/Pause depende das capacidades reais do stream/timeshift.

---

## 44. Entrada numérica de canal

Em Live TV e player Live, dígitos `0–9` podem abrir um overlay compacto.

### Fluxo

1. primeiro dígito abre overlay;
2. acumular até três dígitos;
3. exibir número com padding, por exemplo `005`;
4. após timeout curto (~1100 ms), confirmar;
5. se existir, trocar canal;
6. se não existir, informar `Canal 999 não encontrado` sem sair do contexto.

O overlay deve desaparecer após a ação.

---

## 45. Taxonomia de erros acionáveis

Erro não é apenas uma mensagem; é um componente com próxima ação.

| Código exemplo | Situação | Mensagem principal | Ação |
|---|---|---|---|
| `NET-01` | sem conexão | Sem internet | Tentar novamente |
| `SRC-401` | credencial recusada | Credencial inválida | Editar credenciais |
| `EPG-02` | EPG falhou | Programação indisponível | Sincronizar EPG |
| `PLAY-04` | stream falhou | Stream indisponível | Tentar novamente / Info técnica |
| `API-429` | limite de API | Serviço temporariamente limitado | Tentar mais tarde |

### Regras

- dizer **o que aconteceu**;
- quando possível, dizer **por quê**;
- oferecer **uma ação primária útil**;
- preservar contexto e foco;
- incluir código técnico sem transformar a UI em console de debug.

---

## 46. Checklist de aceitação V13

Antes de um fluxo ser considerado V13-ready:

### Input

- usa Samsung IME para texto livre;
- possui `inputmode/type/autocomplete` coerentes;
- oferece pareamento por celular para credenciais longas quando aplicável.

### Accessibility

- todo item focável possui nome acessível útil;
- soft disabled explica motivo;
- anúncios não interrompem excessivamente;
- legenda é personalizável;
- reduced motion e alto contraste não quebram layout.

### Remote

- Play/Pause físico revela OSD e posiciona foco;
- long press não dispara previews sucessivos;
- Return restaura contexto;
- número de canal funciona em Live quando suportado.

### System

- suspensão cancela timers e previews;
- resume verifica rede;
- offline preserva o que puder funcionar localmente;
- foco é restaurado por área/categoria.

### Error handling

- erro possui causa/contexto;
- existe ação corretiva;
- foco permanece previsível.

---

## 47. Governança do Design System

A fonte de verdade do V13 é formada por quatro artefatos sincronizados:

1. **Design System Spec Markdown V13** — regras e decisões normativas;
2. **Component Lab HTML V13** — catálogo visual/interativo;
3. **protótipo CCPlayTV V13** — aplicação das regras em telas reais;
4. **implementação Tizen** — comportamento final em hardware.

Quando um componente mudar, atualizar no mínimo:

- tokens envolvidos;
- documentação Markdown;
- Component Lab;
- protótipo;
- QA correspondente.

Nenhuma decisão exclusiva do protótipo deve virar regra de sistema sem ser documentada aqui.

---

## 48. Categorias pessoais: persistência e dados

### 48.1 Escopo por perfil

Persistir separadamente:

```text
profile:<id>:favoriteChannels
profile:<id>:favoriteMovies
profile:<id>:favoriteSeries
profile:<id>:movieHistory
profile:<id>:seriesHistory
```

Os nomes acima representam o modelo conceitual; a implementação real pode usar banco local, backend ou storage equivalente.

### 48.2 Favoritos

Cada registro deve referenciar um identificador estável do item/fonte.

Evitar usar somente título como chave, pois nomes podem se repetir.

### 48.3 Histórico

Registro mínimo recomendado:

- content id;
- tipo (`movie` / `series`);
- último horário reproduzido;
- posição/progresso quando disponível;
- temporada/episódio quando aplicável;
- timestamp da última reprodução.

### 48.4 Limpeza

O produto deve permitir:

- remover item individual do Histórico;
- limpar Histórico de Filmes;
- limpar Histórico de Séries;
- limpar ambos.

A ação deve pedir confirmação quando destrutiva.

---

## 49. Changelog V12 → V13

Principais mudanças incorporadas:

- Samsung IME como padrão para texto livre;
- campos com `inputmode`, `autocomplete` e labels adequados;
- Voice Guide / ARIA;
- região de anúncio `aria-live`;
- soft disabled vs hard disabled;
- aparência configurável de legendas;
- áudio-descrição como estado explicável;
- network/lifecycle state machine;
- recuperação após `visibilitychange`;
- memória de foco por categoria/área;
- detecção de long press / `event.repeat`;
- cancelamento de trailers/previews durante navegação rápida;
- media keys integradas ao player;
- episódio anterior/próximo no player de séries;
- entrada numérica de canal;
- erros com códigos e ações corretivas;
- Configurações > Acessibilidade & sistema como seção de primeira classe.

---

## 50. Changelog V13 → V13.1

- `★ Favoritos` adicionado como categoria fixa em **Canais, Filmes e Séries**;
- `↺ Histórico` adicionado como categoria fixa em **Filmes e Séries**;
- Favoritos e Histórico definidos como dados **por perfil**;
- categorias pessoais permanecem visíveis mesmo vazias;
- empty states canônicos adicionados;
- diferença entre `Histórico` e `Continue Assistindo` formalizada;
- memória de foco expandida para Favoritos/Histórico;
- persistência conceitual e regras de limpeza do Histórico documentadas.

---

**CCPlayTV Design System V13.1 — Samsung Tizen TV — remote-first, IME/Voice Guide ready, Favoritos/Histórico por perfil, standalone e sem dependências externas obrigatórias.**


---

## Changelog V13.2 → V14 Spectrum

- identidade visual substituída pelo novo Style Guide CCPlayTv;
- accent principal alterado para `#FF7A3D`;
- superfícies normalizadas em `#05060A / #0B0D12 / #15181F / #1D212B / #2A2F3C`;
- texto principal `#F5F6F8`, secundário `#A7ADBB`, disabled `#5C6372`;
- gradiente completo da marca reservado a logo/splash/decoração;
- Poppins adotado para títulos e Inter para UI, com regra Tizen de empacotamento local/fallback;
- escala tipográfica alterada para 64 / 40 / 28 / 24 / 20 / 16 px;
- grid base simplificado para múltiplos de 8;
- safe margin de referência consolidada em 96 px;
- focus ring reformulado para outline laranja 4 px + halo 8 px + glow;
- botão primário passa a usar orange pill;
- cards passam a usar surface 16 px;
- seleção usa orange tint;
- toda funcionalidade Tizen da V13.x permanece: IME, Voice Guide, BYOK, IA, EPG, player, favoritos, histórico e teclado virtual.

**CCPlayTV Design System V14 Spectrum — Samsung Tizen TV — remote-first, standalone e com identidade visual CCPlayTv multicolorida/laranja.**
