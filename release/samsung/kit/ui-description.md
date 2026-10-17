# Application UI Description — CCPlayTV (variante base)

O arquivo enviado ao Seller Office é
**`ui-description/CCPlayTV_UI_Description_0.2.1.pptx`**: o template oficial da Samsung
(`ui-description/app_description_template_eng_v142_edited3.pptx`) preenchido em inglês, com o
fluxo de telas, 7 casos de uso, uma tela por slide com elementos numerados, as teclas do controle e
os idiomas. Nada aqui contém credencial, URL de lista ou chave.

## Antes de enviar: a lista de teste

O template exige a conta de teste do revisor (slide "Use Cases – Add a Playlist"). No git, a tabela
traz só os marcadores `<TEST_HOST>`, `<TEST_USERNAME>` e `<TEST_PASSWORD>`, em vermelho. Na hora da
submissão, faça uma **cópia fora do repositório**, troque os três marcadores pelos dados da lista de
teste autorizada (a mesma de `demo-access.md`, item `SAM-KIT-TESTACCESS`) e envie a cópia. A cópia
preenchida nunca volta para o git.

## Como refazer

1. Capturas, do build de produção (o dev server mostra superfícies só de desenvolvimento):

   ```powershell
   cd tv-web
   npm run build
   npx vite preview --port 4173     # em outro terminal
   node scripts/release/ui-description-shots.mjs
   ```

   Grava `ui-description/ui_NN_<tela>.jpg` com o app em inglês e a lista fictícia de `fakePanel.mjs`.

2. O pptx (python-pptx e Pillow num venv; não são dependências do projeto):

   ```powershell
   python tv-web/scripts/release/ui-description-pptx.py --version 0.2.1
   ```

3. Recalcule o SHA-256 do pptx (e deste arquivo, se mudou) no `manifest.json`: o gate bloqueia hash
   divergente. O pptx não é byte a byte reproduzível (o zip guarda a hora), então todo novo build
   pede hash novo.

Refaça a cada versão com mudança de tela, tecla ou fluxo; os textos e as posições dos números ficam
em `ui-description-pptx.py` (`USE_CASES`, `SCREENS`, `KEYS`, `LANGUAGE`).

## O que o documento afirma (conferido no código em 2026-10-17)

- **Teclas**: setas movem o foco; OK abre ou reproduz; segurar OK ou AMARELA favorita; VERMELHA
  tira do "↺ Histórico"; PLAY/PAUSE, STOP (fecha o player; no Rádio, para a estação), REW/FF (10 s,
  só com seek); CH+/CH− troca de canal no player ao vivo e pagina o guia; 0–9 digitam o PIN.
  RETURN volta um nível; na tela de listas abre "Exit CCPlayTV?". EXIT não é alterada.
- **Idioma**: inglês, português e espanhol, em Ajustes › Accessibility › Language, valendo na hora.
  Padrão: o idioma da TV quando é um dos três; senão, português.
- **Sem portal na variante base**: o build de loja sem `VITE_PORTAL_ORIGIN` não mostra a aba "Pelo
  site" do cadastro nem as abas "Portal & licença" e "Backup" (feature 078, `portalSurfacesVisible`).
- **Sem conta, login próprio, compra no app, assinatura ou publicidade.** A única credencial é a
  lista IPTV da própria pessoa.
