# Medições da 082 no app real da TV (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9. Build de medição (`VITE_CCPLAY_PERF=1` + canal de métricas da 085, com o emissor `epg`
  acrescentado hoje) instalado com autorização do usuário, que operou a lista real. Ao final, o pacote normal foi reinstalado
  (sem o canal no pacote) e o coletor parado.
- **Origem**: `app-metricas-tv-2026-10-20.jsonl` (340 linhas: frames, assembly, entry, section-load; nenhuma `epg`).
- **Classificação**: registro (a 082 foi fechada sem estas medidas, R-021). Uma sessão, sem repetição entre dias.
- Honestidade: o cartão de licença só existe no build comercial, que não foi usado; o roteiro do SC-004 não pôde cobri-lo.

| Critério | Resultado | Veredito |
| --- | --- | --- |
| SC-002 — 1ª página da categoria de 11 386 filmes (referência 178 ms) | `firstPaint` 105, 114 e 153 ms; uma entrada de **6 842 ms** (leitura 1 067 ms, sem causa conhecida). Mediana das entradas reais 114 ms | **Passa nas 3 normais; 1 outlier de 6,8 s em aberto** |
| SC-003 — nenhum quadro > 100 ms por compressão/conversão | `idleSlow` 0 → 28 em ~22 min: 8 na abertura, 15 entre 16:06:53 e 16:07:13 (2ª Atualizar: remontagem de Home e Filmes), 5 ao entrar nas categorias. Na 1ª Atualizar (15:57) não subiu | **Não fecha em zero**; não é atribuível à compressão (o gravador roda no Worker) |
| SC-004 — 3 listas, zero erro de armazenamento | Todas as 6 cargas de seção terminaram `done`, nenhuma `storage_full`. O restante do roteiro não gera métrica e o cartão de licença não existe neste build | **Parcial**: sem erro nas cargas de seção |
| SC-007 — guia ≤ 3 s | Nenhuma linha `epg` em ~25 min: "Sincronizar agora" ficou "Sincronizando" sem terminar. O usuário diz que **já demorava antes** | **Sem número; a sincronização do guia não termina na lista real** |

## Cargas por seção (registro)

Filmes 10,5 s e 11,7 s (43 548 itens); séries 3,0 e 4,5 s; canais 2,0 e 4,1 s. Na 2ª rodada os blocos estavam iguais ao gravado, o
orçamento não foi chamado e `encodeMs` de filmes foi 5,3 s (comparar/preparar blocos iguais custa metade da carga).
