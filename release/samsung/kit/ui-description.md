# Application UI Description — CCPlayTV (variante comercial)

O arquivo enviado ao Seller Office é
**`ui-description/CCPlayTV_UI_Description_0.2.1.pptx`**: o template oficial da Samsung
(`ui-description/app_description_template_eng_v142_edited3.pptx`) preenchido em inglês, com o
fluxo de telas, 9 casos de uso (inclui teste de 7 dias e compra da licença, e o portal web), uma tela
por slide com elementos numerados, as teclas do controle e os idiomas. Nada aqui contém credencial,
URL de lista ou chave.

## Antes de enviar: a lista de teste

O template exige a conta de teste do revisor (slide "Use Cases – Add a Playlist"). No git, a tabela
traz só os marcadores `<TEST_HOST>`, `<TEST_USERNAME>` e `<TEST_PASSWORD>`, em vermelho. Na hora da
submissão, faça uma **cópia fora do repositório**, troque os três marcadores pelos dados da lista de
teste autorizada (a mesma de `demo-access.md`, item `SAM-KIT-TESTACCESS`) e envie a cópia. A cópia
preenchida nunca volta para o git. O acesso do revisor ao app é o teste de 7 dias da instalação nova
(R-015, `reviewerAccess: local-trial-7d`).

## Como refazer

1. Capturas (sem servidor no ar — o roteiro sobe o app em modo comercial numa porta própria, com
   portal e licença fictícios de `fakePanel.mjs`/`fakeCommercial.mjs`; o domínio real aparece na
   tela, mas toda chamada a ele é atendida no navegador, nada chega à produção):

   ```powershell
   cd tv-web
   node scripts/release/ui-description-shots.mjs
   ```

   Grava `ui-description/ui_NN_<tela>.jpg` com o app em inglês.

2. O pptx (python-pptx e Pillow num venv; não são dependências do projeto):

   ```powershell
   python tv-web/scripts/release/ui-description-pptx.py --version 0.2.1
   ```

3. Recalcule o SHA-256 do pptx (e deste arquivo, se mudou) no `manifest.json`: o gate bloqueia hash
   divergente. O pptx não é byte a byte reproduzível (o zip guarda a hora), então todo novo build
   pede hash novo.

Refaça a cada versão com mudança de tela, tecla, preço ou fluxo; os textos e as posições dos números
ficam em `ui-description-pptx.py` (`USE_CASES`, `SCREENS`, `KEYS`, `LANGUAGE`).

## O que o documento afirma (conferido no código em 2026-10-17)

- **Teclas**: setas movem o foco; OK abre ou reproduz; segurar OK ou AMARELA favorita; VERMELHA
  tira do "↺ Histórico"; PLAY/PAUSE, STOP (fecha o player; no Rádio, para a estação), REW/FF (10 s,
  só com seek); CH+/CH− troca de canal no player ao vivo e pagina o guia; 0–9 digitam o PIN.
  RETURN volta um nível; na tela de listas abre "Exit CCPlayTV?". EXIT não é alterada.
- **Idioma**: inglês, português e espanhol, em Ajustes › Accessibility › Language, valendo na hora.
  Padrão: o idioma da TV quando é um dos três; senão, português.
- **Licença**: teste de 7 dias contado na TV; R$ 35 por 12 meses, uma TV, sem renovação automática;
  Pix na TV ou cartão no site, pelo Mercado Pago; depois do teste, abrir uma lista pede a licença
  (o app continua abrindo e os dados ficam).
- **Portal**: opcional; QR, ID e chave na aba "On the website" do cadastro e em Portal & license; a
  TV só fala com o serviço quando a pessoa aperta Reload/Refresh (ADR-016).
- **Sem conta pessoal e sem publicidade.** A credencial da lista é da própria pessoa.
