# Dependências do portal — bootstrap 069

Versões de execução verificadas em 2026-10-11 nos locks e metadados dos
pacotes instalados. `api/uv.lock` e `portal-web/package-lock.json` são
autoridade para reprodução; não usar instalação sem lock na imagem final.

| Pacote | Versão inicial | Licença declarada |
| --- | --- | --- |
| google-cloud-firestore | 2.34.1 | Apache-2.0 |
| google-cloud-storage | 3.17.0 | Apache-2.0 |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| qrcode | 8.2 | BSD, manter aviso do pacote |
| Pillow | 12.3.0 | MIT-CMU |
| React / React DOM | 19.2.8 | MIT |
| Vite | 8.3.0 | MIT |
| TypeScript | 6.0.2 | Apache-2.0 |
| Playwright | 1.63.0 | Apache-2.0 |
| Vitest | 5.0.0 | MIT |

Preservar arquivos LICENSE/NOTICE distribuídos pelos pacotes e revisar
transitivas antes da distribuição comercial (T045). O pacote Python
existente ainda inclui fallback/psycopg LGPL-3.0; o novo entrypoint não
importa seu runtime nem copia seu código para a imagem, mas o lock comum
não elimina obrigações das bibliotecas instaladas. Nenhuma licença de
conteúdo IPTV é concedida pela licença do aplicativo.

Metadados inspecionados localmente: `*.dist-info/METADATA`/LICENSE em
`api/.venv` e package.json/package-lock do portal. Nenhuma credencial real
foi necessária para instalação ou revisão.

## Ferramentas locais de integração (fase 2)

Google Cloud CLI 580.0.0 / componente oficial Cloud Firestore Emulator 1.22.0 instalado. Java 17 do sistema é insuficiente para esse componente. Runtime portátil Temurin JRE25 em .cache/java25, release jdk-25.0.4.1+1 (metadado API semver25.0.4+101.0.LTS), SHA2564c95451cea98556def2c54f7782933f52a26d4a36bd85e1d59f0364464828b07 verificado. Download oficial: https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4.1%2B1/OpenJDK25U-jre_x64_windows_hotspot_25.0.4.1_1.zip. Eclipse Temurin: GPLv2 com Classpath Exception; apenas ferramenta de desenvolvimento, fora da imagem de produção. PATH alterado somente no processo do emulador, sem trocar Java do sistema.
