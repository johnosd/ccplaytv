# Consulta sobre o modelo BYOK

Rascunho para revisão do usuário; não enviado. Não anexar chave, token, senha ou dados IPTV.

Subject: BYOK API keys in a distributed Samsung Tizen application

Hello OpenSubtitles team,

We are evaluating optional subtitle search and download in CCPlayTV, a Samsung Tizen IPTV player.

Our intended model is BYOK: each user would register an API consumer in their own OpenSubtitles account and enter their own API key in the TV app, similarly to a personal TMDB integration. We would not distribute a shared developer API key in the application.

We saw your September 2026 guidance stating that distributed applications should have their own application API key rather than ask each user to create one.

Could you confirm whether our intended BYOK model is permitted for a distributed application? If it is, what requirements apply to consumer registration, application identification, local key storage, quotas, account tiers, and any paid plan?

Requests would be initiated by the user, for movie/episode subtitles in Brazilian Portuguese, English or Spanish. We would never send IPTV credentials, provider stream URLs or video data to OpenSubtitles.

If BYOK is not an accepted model, please confirm whether a single application consumer is required and what supported authentication/deployment options apply to a client-only Tizen application.

Thank you.
