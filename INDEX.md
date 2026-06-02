# apontamentodev — Índice do Projeto

## Propósito da Pasta

PWA (Progressive Web App) de chão de fábrica para **registro de apontamentos de produção e horas paradas**, integrado ao ERP Protheus (TOTVS) via HTTP POST.
Desenvolvido para uso interno pela Progeral, destinado a operadores que registram produção diretamente do tablet/celular no chão de fábrica. 

Recentemente migrado de um modelo monolítico para uma **Arquitetura LAMP**, visando maior segurança, modularidade e performance.

---

## Arquivos e Responsabilidades

| Arquivo/Diretório | Tipo | Responsabilidade |
|---|---|---|
| `index.html` | Aplicação principal | HTML principal enxuto. Carrega dependências estáticas, folhas de estilo e o motor JS. |
| `api/proxy.php` | Backend / Proxy | **[NOVO]** Recebe as requisições POST do Front-end via `/api/proxy.php?tipo=X` e as despacha internamente para a intranet do ERP (192.168.8.21). Resolve problemas de Mixed Content (HTTPS) e esconde o IP da intranet. |
| `assets/css/` | Estilos | Contém `main.css` (estilos globais da UI) e `duvidas.css` (estilos específicos do guia de ajuda). |
| `assets/js/` | Lógica JS | Contém `app.js` (motor principal do app, validações de data e numéricas anti-erro, fetch e conexão) e `duvidas.js` (eventos e navegação do manual de ajuda). |
| `.htaccess` | Configuração Apache | **[NOVO]** Força políticas agressivas de No-Cache para arquivos dinâmicos (HTML e JS), assegurando que listas de OPs e produtos estejam sempre atualizadas para os operadores. |
| `manifest.json` | PWA Manifest | Define nome, ícones, tema, idioma, orientação e escopo para instalação como app nativo e geração de APK via PWABuilder/Bubblewrap. |
| `sw.js` | Service Worker | Cacheia assets para funcionamento offline (arquivos de layout, não bloqueia o cache estratégico das listas PWA). |
| `colaboradores.js` | Dados | Exporta `window.COLABORADORES` — mapa `matrícula → { nome, usuarioProtheus }`. Gerado a partir do cadastro do ERP. |
| `produtos.js` | Dados | Exporta `window.APP_DB.produtos` — catálogo completo de produtos (`codigo → descrição`). |
| `recursos.js` | Dados | Exporta `window.APP_DB.recursos` — cadastro de máquinas e recursos de produção. |
| `motivos.js` | Dados | Exporta `window.APP_DB.motivos` — tabela de motivos de parada. |
| `ops.js` | Dados | Exporta `window.APP_DB.ops` — ordens de produção abertas. |
| `zink-data.js` | Dados | Exporta `window.ZINK_DATA` — peso unitário por produto para a linha de galvanização ZINK. |
| `icons/` | Assets | Ícones e logos utilizados na interface. |

---

## Dependências entre arquivos

```text
index.html
  ├── /assets/css/main.css
  ├── /assets/css/duvidas.css
  ├── /assets/js/app.js  (Motor principal PWA)
  ├── /assets/js/duvidas.js
  ├── /api/proxy.php     (Gateway para o ERP Protheus)
  ├── produtos.js        → window.APP_DB.produtos
  ├── recursos.js        → window.APP_DB.recursos
  ├── motivos.js         → window.APP_DB.motivos
  ├── ops.js             → window.APP_DB.ops
  ├── zink-data.js       → window.ZINK_DATA
  ├── colaboradores.js   → window.COLABORADORES
  ├── manifest.json      (PWA)
  └── sw.js              (Service Worker)
```

Todos os arquivos de dados (raiz) e os scripts principais são carregados de forma **assíncrona e sequencial via loader dinâmico no final do HTML**, que anexa um timestamp (cache-busting) às URLs para impedir o cache do navegador e garantir dados sempre atualizados.

---

## Telas da Aplicação

| ID da Tela | Nome | Acesso |
|---|---|---|
| `screen-home` | Home | Tela inicial, ponto de entrada |
| `screen-prod` | Apontamento de Produção | OP, produto, recurso, turno, quantidades |
| `screen-parada` | Apontamento de Horas Paradas | Motivo, recurso, turno, período |
| `screen-duvidas` | Guia de Dúvidas | Regras de apontamento e FAQ |

---

## Endpoints de Integração (Arquitetura Atual)

As requisições REST não são mais feitas do front-end para a intranet, passando pelo nosso Proxy PHP de Segurança:

| Tipo | Chamada Externa (JS App) | Roteamento Interno (PHP Proxy → Intranet) |
|---|---|---|
| Produção | `POST api/proxy.php?tipo=producao` | `POST http://192.168.8.21:20080/apontamentodeproducao` |
| Parada | `POST api/proxy.php?tipo=parada` | `POST http://192.168.8.21:20080/apontamentodehorasparadas` |

> ✅ O app pode ser servido livremente sob `HTTPS` seguro pelo servidor LAMP; as políticas CORS e Mixed Content estão blindadas pelo `proxy.php`.

---

## Versão e Melhorias Recentes

`v2.1.1 (Compatibilidade PWABuilder / Geração de APK)` — Atualização: Junho/2026
- **manifest.json:** Adicionados campos `lang`, `scope`, `orientation`, `categories` e `prefer_related_applications` para compatibilidade com PWABuilder e Bubblewrap. Corrigido `start_url` para caminho absoluto. Descrição expandida para atender requisitos de empacotamento Android.

## Versão e Melhorias Recentes

`v2.0.3 (Resiliência do Proxy PHP & Melhorias de UX)` — Atualização: Maio/2026
- **Fallback de Comunicação no Proxy:** Implementado fallback automático para o método nativo `file_get_contents` caso a extensão `cURL` esteja inativa no servidor web, solucionando erros 500 silenciosos de comunicação.
- **Data no Resumo de Confirmação:** Adicionada a exibição da data selecionada pelo operador na tela/modal de confirmação antes de submeter os apontamentos de produção e paradas.

`v2.0.2 (Preenchimento Automático de Produto por OP)` — Atualização: Maio/2026
- **Preenchimento Automático do Produto por OP:** Quando o operador digita uma O.P. válida (evento `input`), o sistema preenche e valida imediatamente o **Produto** e a **Descrição** correspondentes nas telas de Produção e Parada, aplicando o feedback visual verde (sucesso) para evitar associação incorreta de produtos e O.P.s.

`v2.0.1 (UI/UX e Validação Dinâmica)` — Atualização: Maio/2026
- **Alinhamento do Grid (UI):** Refatoração da grade CSS para alinhamento vertical dos campos de tempo diretamente sob os campos de data correspondentes.
- **Validação Reativa (30 Dias):** Implementação de lógica de feedback imediato para o limite retroativo de 30 dias. Uso da classe `.user-interacted` para disparar alertas visuais (borda vermelha e mensagem de erro) no momento da interação (blur/setas), sem depender do envio do formulário.
- **Restrição de Entrada Numérica:** Aplicação de `inputmode="numeric"` nos campos de Matrícula e OP para garantir a integridade dos dados e otimizar o teclado em dispositivos móveis.
- **Mapeamento de Produtos (produtos.js):** Compatibilidade total com a nova estrutura de objetos em `produtos.js`. Garantia de que o preenchimento automático das descrições de produtos funcione corretamente conforme a nova arquitetura de dados global.
- **Validação Dinâmica de Quantidade (Decimais vs Inteiros):** O campo de Quantidade Produzida (`p-qtd`) bloqueia dinamicamente caracteres não permitidos com base na Unidade de Medida (UM) do produto. Unidades como `PC` ou `UN` bloqueiam ponto (`.`) e vírgula (`,`), enquanto unidades como `KG`, `M` ou `MT` aceitam ponto decimal. A vírgula (`,`) é bloqueada para todos os produtos. A leitura do valor usa `parseFloat` para unidades decimais e `parseInt` para inteiras.
- **Suporte a Peso Decimal (Cálculo Zink):** O campo `p-peso` agora utiliza `parseFloat`, viabilizando o uso de pesos fracionários e corrigindo o cálculo da quantidade que antes descartava decimais. O valor calculado é arredondado para cima (`Math.ceil`) visto que a saída final em peças deve ser inteira.
- **Validação de Matrícula (Tamanho Estrito):** Matrículas de operadores agora são restritas a exatamente 6 caracteres numéricos. Caso o comprimento seja diferente, mensagens explicativas de erro de comprimento são disparadas em tempo real e no envio.
- **Validação Cruzada de OP Opcional:** A Ordem de Produção continua sendo um campo opcional. Contudo, se preenchida pelo operador, o sistema realiza uma validação cruzada contra a base real de OPs (`ops.js`), bloqueando a gravação/teste caso não seja encontrada.

`v2.0.0 (Refatoração LAMP)` — Atualização: 2026-05-07
- **Desmembramento:** Fim do `index.html` monolítico (separado em `/assets`).
- **Segurança:** Implementação de Proxy PHP; Filtro de XSS nos modais de busca.
- **Validações Strict:** Regras validadoras blindadas para Data (Impede fevereiro > 29) e Inputs Numéricos (Travamento do teclado Mobile via `inputmode="numeric"` para quantidades).
- **Sem Cache em Produção:** Implementado `.htaccess` e um Carregador Dinâmico Sequencial com Timestamp (cache-busting) injetado diretamente no HTML.
