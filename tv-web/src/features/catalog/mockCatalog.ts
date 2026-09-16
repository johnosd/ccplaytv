// Dados de exemplo do protótipo do Claude Design ("CCPlayTv - Prototype.dc.html").
// Live TV/Filmes/Séries continuam mock até a integração TMDB (item futuro
// do backlog) — combinado explicitamente com o usuário nesta implementação.

export interface MockMovie {
  id: string
  title: string
  year: number
  genre: string
  rating: string
  dur: string
  synopsis: string
  cast: string
}

export interface MockEpisode {
  title: string
  dur: string
  synopsis: string
}

export interface MockSeason {
  name: string
  episodes: MockEpisode[]
}

export interface MockSeries {
  id: string
  title: string
  genre: string
  synopsis: string
  cast: string
  seasons: MockSeason[]
}

export interface MockChannelGroup {
  name: string
  channels: string[]
}

export const MOVIES: MockMovie[] = [
  {
    id: 'm1',
    title: 'Fronteira de Vidro',
    year: 2023,
    genre: 'Ficcao',
    rating: '14',
    dur: '1h 58min',
    synopsis:
      'Um engenheiro descobre que a cidade onde vive e um teste controlado por uma corporacao, e precisa escolher entre expor a verdade ou proteger quem ama.',
    cast: 'Rafael Bittencourt, Lia Nakamura, Otavio Serra',
  },
  {
    id: 'm2',
    title: 'Noite de Cao',
    year: 2021,
    genre: 'Comedia',
    rating: '12',
    dur: '1h 42min',
    synopsis:
      'Dois irmaos rivais precisam trabalhar juntos numa unica noite caotica para salvar o restaurante da familia.',
    cast: 'Bruno Galvao, Cecilia Prado',
  },
  {
    id: 'm3',
    title: 'Mar Sem Nome',
    year: 2024,
    genre: 'Drama',
    rating: '16',
    dur: '2h 05min',
    synopsis:
      'Uma pescadora enfrenta a comunidade local ao denunciar a contaminacao da baia onde cresceu.',
    cast: 'Yara Montenegro, Diego Falcao',
  },
  {
    id: 'm4',
    title: 'Ultima Rodada',
    year: 2020,
    genre: 'Acao',
    rating: '16',
    dur: '1h 51min',
    synopsis:
      'Um ex-piloto de corrida e forcado a voltar as pistas para pagar uma divida com o crime organizado.',
    cast: 'Thiago Marreiro, Nina Kessler',
  },
  {
    id: 'm5',
    title: 'Constelacao Cinza',
    year: 2022,
    genre: 'Ficcao',
    rating: '12',
    dur: '2h 12min',
    synopsis:
      'Uma astronauta perdida em orbita reconstroi, por radio, a relacao com a filha que deixou na Terra.',
    cast: 'Marina Sotto, Caue Lira',
  },
  {
    id: 'm6',
    title: 'Sotaque do Norte',
    year: 2019,
    genre: 'Drama',
    rating: '10',
    dur: '1h 38min',
    synopsis:
      'Um professor recem-formado leva educacao a uma vila ribeirinha isolada e enfrenta resistencia local.',
    cast: 'Pedro Anaia, Luzia Ferraz',
  },
  {
    id: 'm7',
    title: 'Requiem de Neon',
    year: 2023,
    genre: 'Suspense',
    rating: '16',
    dur: '1h 49min',
    synopsis: 'Uma detetive investiga uma serie de desaparecimentos ligados a uma boate clandestina.',
    cast: 'Isadora Blanc, Renato Xavier',
  },
  {
    id: 'm8',
    title: 'Campo Aberto',
    year: 2018,
    genre: 'Drama',
    rating: 'livre',
    dur: '1h 35min',
    synopsis:
      'Uma familia de agricultores decide replantar a terra apos anos de seca, contra todas as previsoes.',
    cast: 'Joaquim Prata, Helena Duarte',
  },
  {
    id: 'm9',
    title: 'Circuito Fechado',
    year: 2024,
    genre: 'Suspense',
    rating: '14',
    dur: '1h 57min',
    synopsis: 'Um seguranca de shopping percebe um padrao perturbador nas cameras durante o turno da noite.',
    cast: 'Tomas Reider, Beatriz Cunha',
  },
  {
    id: 'm10',
    title: 'Ilha de Sal',
    year: 2021,
    genre: 'Aventura',
    rating: 'livre',
    dur: '1h 44min',
    synopsis:
      'Tres amigos de infancia voltam a ilha onde cresceram para cumprir uma promessa feita decadas atras.',
    cast: 'Vinicius Amaro, Sofia Rangel',
  },
  {
    id: 'm11',
    title: 'Combustao',
    year: 2020,
    genre: 'Acao',
    rating: '16',
    dur: '1h 47min',
    synopsis:
      'Um bombeiro investigativo suspeita que os incendios da temporada sao todos provocados pela mesma pessoa.',
    cast: 'Adriano Vasques, Carla Miron',
  },
  {
    id: 'm12',
    title: 'Ao Sul do Silencio',
    year: 2022,
    genre: 'Drama',
    rating: '12',
    dur: '2h 01min',
    synopsis: 'Depois de um acidente, um pianista precisa reaprender a se comunicar sem usar as maos.',
    cast: 'Elisa Fontoura, Gustavo Nery',
  },
]

export const SERIES: MockSeries[] = [
  {
    id: 's1',
    title: 'Codigo Aberto',
    genre: 'Drama tecnologico',
    synopsis:
      'Um grupo de programadores expoe corrupcao corporativa atraves de uma falha de seguranca que descobrem por acaso.',
    cast: 'Bianca Solera, Theo Marchetti',
    seasons: [
      {
        name: 'Temporada 1',
        episodes: [
          { title: 'Ep. 1 - Falha zero', dur: '44min', synopsis: 'A equipe encontra uma vulnerabilidade critica escondida ha anos.' },
          { title: 'Ep. 2 - Backdoor', dur: '41min', synopsis: 'Rastros da falha levam a um contrato secreto do governo.' },
          { title: 'Ep. 3 - Sandbox', dur: '46min', synopsis: 'Um teste controlado sai do controle e expoe a equipe.' },
          { title: 'Ep. 4 - Log de acesso', dur: '43min', synopsis: 'Alguem de dentro esta vazando informacoes para a imprensa.' },
        ],
      },
      {
        name: 'Temporada 2',
        episodes: [
          { title: 'Ep. 1 - Reinicializacao', dur: '45min', synopsis: 'Seis meses depois, a equipe se reagrupa sob nova identidade.' },
          { title: 'Ep. 2 - Firewall', dur: '42min', synopsis: 'A corporacao contra-ataca com uma investigacao interna.' },
        ],
      },
    ],
  },
  {
    id: 's2',
    title: 'Terra Vermelha',
    genre: 'Drama rural',
    synopsis: 'Tres geracoes de uma familia disputam o destino da fazenda em meio a segredos antigos.',
    cast: 'Amaro Guedes, Iris Falconi',
    seasons: [
      {
        name: 'Temporada 1',
        episodes: [
          { title: 'Ep. 1 - Heranca', dur: '50min', synopsis: 'A morte do patriarca reabre disputas antigas entre os irmaos.' },
          { title: 'Ep. 2 - Divisa', dur: '48min', synopsis: 'Um mapa antigo revela uma fronteira nunca resolvida.' },
          { title: 'Ep. 3 - Safra', dur: '49min', synopsis: 'A colheita ameaca falhar e a familia precisa se unir.' },
        ],
      },
    ],
  },
]

export const CHANNEL_GROUPS: MockChannelGroup[] = [
  { name: 'Noticias', channels: ['Canal Manha', 'Rede Fato', 'Jornal 24h', 'Agencia Sul'] },
  { name: 'Esportes', channels: ['Arena Total', 'Gol a Gol', 'Copa Livre', 'Volei+'] },
  { name: 'Filmes e Series', channels: ['Cine Estelar', 'Max Drama', 'Comedia Total', 'Suspense 24h'] },
  { name: 'Infantil', channels: ['TV Pequena', 'Aventura Kids', 'Toon Mania'] },
  { name: 'Documentario', channels: ['Mundo Real', 'Natureza Viva', 'Historia+'] },
]
