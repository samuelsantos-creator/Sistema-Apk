# Session: Refatoração do Monolito para Arquitetura LAMP PWA

**Date:** 2026-05-07 17:18
**Project:** apontamentodev
**Participant:** Marcus Almeida

## Objective
Refatorar a aplicação monolítica (`index.html` gigante) em uma arquitetura modularizada LAMP, resolver problemas de Mixed Content (CORS/HTTPS) na comunicação com o ERP Protheus, implementar validações estritas (datas reais, valores numéricos inteiros), corrigir bugs na UI e garantir que os dados de produção nunca fiquem em cache no dispositivo dos operadores.

## Analysis Performed
- **Estrutura:** O `index.html` original continha mais de 5.000 linhas, mesclando HTML, CSS e JavaScript complexo.
- **Segurança:** O frontend PWA tentava acessar diretamente um IP da intranet (`192.168.8.21:20080`), o que bloqueava a implantação segura via HTTPS (Mixed Content). Também foi identificado um vetor de XSS no modal de pesquisa.
- **Cache:** Navegadores móveis estavam servindo versões obsoletas do banco de dados simulado (`produtos.js`, `ops.js`, etc.), o que induzia operadores ao erro.
- **Bugs Visuais:** A barra de rolagem lançava um TypeError no script de dúvidas por tentar manipular um elemento nulo.
- **Validações:** O input de data aceitava dias inválidos (ex: 31 de fevereiro) e a quantidade aceitava números decimais/vírgula.

## Conclusions and Decisions
1. **Modularização Extrema:** Desmembramento total do monolito. Criação dos diretórios `assets/css` e `assets/js`. O `index.html` agora serve apenas como esqueleto.
2. **Implementação de Proxy PHP:** Foi decidido criar o arquivo `api/proxy.php` que rodará no backend do servidor LAMP. Ele fará as requisições para a intranet, permitindo que a aplicação externa se conecte usando HTTPS seguro.
3. **Validação Anti-Cache Agressiva:**
   - Adicionado `.htaccess` para forçar o não-cacheamento via headers do Apache.
   - Criado um carregador dinâmico anti-cache via Javascript puro no final do `index.html`. Ele injeta um `timestamp` em todos os arrays de dados e scripts, anulando o cache nativo.
4. **UX/UI Constraints:** 
   - Modificado o tipo de teclado nos inputs de quantidade (`inputmode="numeric"`, `step="1"`) e ajustadas as funções em Javascript para forçar que todo valor inserido seja parseado como inteiro.

## Code Generated or Modified
- `index.html` (Refatorado: de 5.500 linhas para ~1.480 linhas, implementado loader dinâmico).
- `assets/css/main.css` [NOVO] (Extraído do monolito).
- `assets/css/duvidas.css` [NOVO] (Extraído do monolito).
- `assets/js/app.js` [NOVO] (Motor PWA, validações estritas e comunicação via proxy PHP).
- `assets/js/duvidas.js` [NOVO] (Eventos da página de ajuda; TypeError consertado).
- `api/proxy.php` [NOVO] (Backend Proxy cURL para conexão com o Protheus).
- `.htaccess` [NOVO] (Políticas do servidor Apache).
- `INDEX.md` (Totalmente reescrito para refletir a nova arquitetura).
- `DECISIONS.md` [NOVO] (Criado histórico de decisões arquiteturais).
- `CHANGELOG.md` [NOVO] (Criado registro de atualizações do app).

## Pending Items and Next Steps
- **Validação:** Homologar o PWA com os operadores no chão de fábrica para confirmar que o `timestamp` dinâmico parou de exibir OPs velhas em cache.
- **Monitoramento PHP:** Acompanhar o error log do proxy para identificar problemas de timeout no ERP Protheus.

## References Used
- Apple HIG Patterns (Validações visuais e bloqueio de inputs).
- Padrões LAMP (Separação Backend x Frontend).
