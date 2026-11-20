# 🕵️ Jogo do Infiltrado

Jogo online de dedução social para 3 a 12 jogadores, com salas por código, chat e modo desenho.

## Rodar no seu computador
```bash
npm install
npm start
```
Abra http://localhost:3000. Para testar com amigos na mesma rede, use o IP do seu computador (ex.: `http://192.168.0.10:3000`).

## Como jogar
- **Clássico:** todos recebem a mesma palavra, menos o(s) infiltrado(s). Cada um dá uma dica de **uma palavra** na sua vez (sem dizer a palavra e sem repetir dica já usada). Depois votam em quem acham que é o infiltrado.
- **Desenho:** todos recebem uma palavra, o infiltrado recebe outra do mesmo tema. Cada um desenha, depois explica por que desenhou, e todos votam.
- O chat bloqueia mensagens que contenham a palavra secreta.
- Pontos: tripulantes ganham 1 se acharem o(s) infiltrado(s); infiltrados ganham 2 se escaparem.

## Publicar (GitHub + Render, gratuito)
1. Crie um repositório no GitHub e envie esta pasta (`git init`, `git add .`, `git commit`, `git push`).
2. Em https://render.com crie um **Web Service** ligado ao repositório.
3. Build Command: `npm install` · Start Command: `npm start`.
4. Pronto: compartilhe a URL. Funciona também em Railway, Fly.io ou qualquer host com Node 18+ e WebSocket.

## Observações
- As salas ficam na memória do servidor: use **uma única instância**. Se o servidor reiniciar, as salas se perdem.
- Quem cai da conexão reconecta sozinho e volta para a mesma sala (identificação salva no navegador).
- Planos gratuitos podem "dormir" após inatividade; o primeiro acesso pode demorar alguns segundos.
- Para adicionar palavras ou temas, edite `words.js`. Os avatares são emojis e ficam em `public/app.js` (`AV`).
