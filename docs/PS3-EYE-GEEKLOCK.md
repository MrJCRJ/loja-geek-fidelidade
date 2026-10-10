# PlayStation Eye no GeekLock

A câmera desta estação é a **Sony PlayStation Eye SLEH-00448** (USB `VID_1415` `PID_2000`). O LED azul acende, mas o Windows não instala o vídeo: a interface é classe USB `FF`, não webcam padrão (UVC). O código do problema é **28** (`CM_PROB_FAILED_INSTALL`).

O GeekLock abre a câmera pelo Chromium (`getUserMedia`). Esse caminho só enxerga câmera normal do Windows. A Eye precisa de duas peças, só na estação que usa essa câmera:

1. **Driver DirectShow** [Universal PS3 Eye Driver 1.0 beta 2](https://github.com/jkevin/PS3EyeDirectShow/releases/tag/1.0b2) (`PS3EyeInstallerBeta2.msi`). Depois da instalação o dispositivo se chama `PS3 Eye Universal`. Script: `scripts/ps3eye-bridge/instalar-driver.ps1`.
2. **Ponte no GeekLock** (`agent-windows/electron/ps3eye-bridge.cjs`). O app lê esse DirectShow com ffmpeg e publica um JPEG em `http://127.0.0.1:4777`. A tela monta um `MediaStream` em 640×480, que é o teto da Eye. As outras estações não mudam: se existir webcam UVC, o GeekLock continua nela.

Não usar Zadig com `libusb0` nessa câmera: o filtro da Eye trabalha com WinUSB e o outro driver entrega quadro preto.

A EMEET SmartCam C950 é webcam UVC e não precisa desta ponte.
