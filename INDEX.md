# Apps-testes — Índice do Projeto

## Propósito da Pasta

PWA (Progressive Web App) de chão de fábrica para **registro de apontamentos de produção e horas paradas**, integrado ao ERP Protheus (TOTVS) via HTTP POST.
Desenvolvido para uso interno pela Progeral, destinado a operadores que registram produção diretamente do tablet/celular no chão de fábrica.

A aplicação é transformada em **APK Android** via **Capacitor** + **Ionic Appflow** e distribuída via **Headwind MDM**.

---

## Arquivos e Responsabilidades

| Arquivo/Diretório | Tipo | Responsabilidade |
|---|---|---|
| `index.html` | Aplicação principal | HTML principal enxuto. Carrega dependências estáticas, folhas de estilo e o motor JS. |
| `manifest.json` | PWA Manifest | Define nome, ícones, tema, idioma, orientação e escopo para instalação como app nativo. |
| `sw.js` | Service Worker | Cacheia assets para funcionamento offline (arquivos de layout). |
| `api/proxy.php` | Backend / Proxy | Recebe requisições POST do front-end e as despacha para o ERP Protheus (192.168.8.21). Resolve Mixed Content e esconde IP da intranet. |
| `assets/css/main.css` | Estilos | Estilos globais da UI com suporte responsivo para tablets (landscape e portrait). |
| `assets/css/duvidas.css` | Estilos | Estilos específicos do guia de ajuda. |
| `assets/js/app.js` | Lógica JS | Motor principal do app, validações, fetch e conexão com o proxy. |
| `assets/js/duvidas.js` | Lógica JS | Eventos e navegação do manual de ajuda. |
| `produtos.js` | Dados | `window.APP_DB.produtos` — catálogo de produtos. |
| `ops.js` | Dados | `window.APP_DB.ops` — ordens de produção abertas. |
| `recursos.js` | Dados | `window.APP_DB.recursos` — cadastro de máquinas/recursos. |
| `motivos.js` | Dados | `window.APP_DB.motivos` — motivos de parada. |
| `centro_custo.js` | Dados | `window.APP_DB.centro_custo` — descrição e mapeamento de setores de destino. |
| `colaboradores.js` | Dados | `window.COLABORADORES` — mapa matrícula → nome. |
| `zink-data.js` | Dados | `window.ZINK_DATA` — peso unitário por produto (ZINK). |
| `capacitor.config.json` | Config Capacitor | Configuração do APK e definição da pasta de build (`.build/dist`). |
| `.build/dist/` | Build | Diretório gerado pelo script `build.js` contendo os arquivos finais para empacotamento pelo Ionic Appflow. |
| `build.js` | Build | Script Node.js que copia os ativos do PWA para a pasta `.build/dist` para empacotamento. |
| `package.json` | Dependências | Configurações de scripts (build) e dependências Capacitor. |
| `android/` | Projeto Android | Gerado pelo Capacitor; compilado na nuvem pelo Ionic Appflow. |
| `.htaccess` | Config Apache | Políticas agressivas de No-Cache para dados dinâmicos. |
| `assets/css/fa/all.min.css` | Assets | Folha de estilo do Font Awesome (local, sem CDN). |
| `assets/fonts/fa-solid-900.woff2` | Assets | Fonte Font Awesome (ícones sólidos). |
| `assets/fonts/fa-regular-400.woff2` | Assets | Fonte Font Awesome (ícones regulares). |
| `assets/fonts/fa-brands-400.woff2` | Assets | Fonte Font Awesome (ícones de marcas). |
| `assets/fonts/fa-v4compatibility.woff2` | Assets | Fonte Font Awesome (compatibilidade v4). |
| `icons/` | Assets | Ícones e logos da interface. |
| `icons/app-icon.jpg` | Assets | Imagem fonte 1024×1024 para geração de ícones Android e PWA. |
| `deploy.py` | Deploy | Script Python (Paramiko) que sobe `app.js` + `main.css` via SFTP com backup local. |
| `deploy.ps1` | Deploy | Wrapper PowerShell do deploy.py (verifica dependências). |
| `api/.env` | Config | Credenciais SSH do servidor de produção (não sobe para o VPS). |
| `backups/` | Deploy | Backups locais dos arquivos remotos antes de cada deploy (gitignored). |

---

## Dependências entre arquivos

```text
index.html
  ├── /assets/css/fa/all.min.css   (Font Awesome local)
  ├── /assets/css/main.css
  ├── /assets/css/duvidas.css
  ├── /assets/js/app.js  (Motor principal PWA)
  ├── /assets/js/duvidas.js
  ├── /api/proxy.php     (Gateway para o ERP Protheus)
  ├── produtos.js        → window.APP_DB.produtos
  ├── recursos.js        → window.APP_DB.recursos
  ├── motivos.js         → window.APP_DB.motivos
  ├── centro_custo.js    → window.APP_DB.centro_custo
  ├── ops.js             → window.APP_DB.ops
  ├── zink-data.js       → window.ZINK_DATA
  ├── colaboradores.js   → window.COLABORADORES
  ├── manifest.json      (PWA)
  └── sw.js              (Service Worker)
```

Todos os arquivos de dados (raiz) são carregados de forma **assíncrona e sequencial via loader dinâmico** no final do HTML, que anexa timestamp (cache-busting) às URLs para impedir cache do navegador.

---

## Telas da Aplicação

| ID da Tela | Nome | Acesso |
|---|---|---|
| `screen-home` | Home | Tela inicial, 3 opções: Produção, Parada, Dúvidas |
| `screen-prod` | Apontamento de Produção | OP, produto, recurso, turno, quantidades |
| `screen-parada` | Apontamento de Horas Paradas | Motivo, recurso, turno, período |
| `screen-duvidas` | Guia de Dúvidas | Regras de apontamento e FAQ |

---

## Endpoints de Integração

| Tipo | Chamada Front-end | Roteamento Interno (PHP Proxy → Intranet) |
|---|---|---|
| Produção | `POST api/proxy.php?tipo=producao` | `POST http://192.168.8.21:20080/apontamentodeproducao` |
| Parada | `POST api/proxy.php?tipo=parada` | `POST http://192.168.8.21:20080/apontamentodehorasparadas` |

---

## Pipeline APK (Capacitor + Ionic Appflow)

```text
Código (HTML/CSS/JS)
    │ git push
    ▼
GitHub (samuelsantos-creator/Sistema-Apk)
    │ webhook / manual
    ▼
Ionic Appflow (Cloud Build)
    │ compila APK
    ▼
APK Android (Debug)
    │ upload
    ▼
Headwind MDM
    │ distribui
    ▼
Tablets (chão de fábrica)
```
> **Nota:** O APK agora empacota os arquivos web nativamente de forma local (Offline-First). Alterações em CSS/JS e HTML requerem o acionamento do pipeline de build do Ionic Appflow para gerar e distribuir um novo APK.

---

## Versões

| Versão | Data | Descrição |
|---|---|---|
| 1.4.8 | Ago/2026 | Layout ultra compacto para tablets, empacotamento offline nativo e script build.js configurado |
| 1.4.7 | Jul/2026 | OP obrigatória para produtos E/TT/J, bloqueio de campos, deploy simplificado com backup local |
| 1.4.6 | Jun/2026 | Font Awesome local, performance (will-change, defer fonts), correção especificidade CSS dúvidas |
| 1.4.5 | Jun/2026 | Responsividade landscape, .build/, novo ícone, monitor conexão com ping HTTP |
| 1.4.0 | Jun/2026 | Capacitor + Ionic Appflow + APK Android |
| 2.1.1 | Jun/2026 | Compatibilidade PWABuilder (manifest.json) |
| 2.1.0 | Mai/2026 | Idempotência 3 camadas + validações |
| 2.0.3 | Mai/2026 | Fallback cURL no proxy PHP |
| 2.0.2 | Mai/2026 | Preenchimento automático produto por OP |
| 2.0.1 | Mai/2026 | Validação dinâmica UI/UX |
| 2.0.0 | Mai/2026 | Refatoração LAMP completa |
