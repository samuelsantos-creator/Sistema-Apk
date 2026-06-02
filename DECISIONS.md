# Architecture Decision Records (ADR)

Este arquivo documenta as principais decisões arquiteturais tomadas para o projeto `apontamentodev`.

## [ADR-001] Separação Monolítica e Adoção de Arquitetura LAMP (v2.0.0)

**Data:** 2026-05-07
**Contexto:** A aplicação original consistia em um `index.html` de mais de 5.000 linhas contendo marcação, CSS e regras de negócios JavaScript. Esse formato dificultava a manutenção, versionamento e escalabilidade do projeto. Além disso, a aplicação fazia requisições HTTP REST diretamente para a intranet do ERP (`192.168.8.21:20080`), o que gerava bloqueios de Mixed Content ao tentar servir o PWA de forma segura (HTTPS) para a web pública.

**Decisão:**
1. Desmembrar a aplicação em estáticos (`/assets/css/` e `/assets/js/`).
2. Introduzir um Proxy PHP (`/api/proxy.php`) servido no servidor web (LAMP).
3. Alterar os apontamentos do front-end (`app.js`) para apontar para o proxy, transferindo o peso da comunicação com a intranet para o backend em PHP.

**Consequências:**
- **Positivas:** Permite servir o site principal via HTTPS sem erros CORS ou Mixed Content. O IP interno e a topologia de rede ficam ocultos dos clientes web. Facilita a manutenção através da divisão de responsabilidades.
- **Negativas:** Exige um servidor PHP operante, perdendo a característica "serverless" do PWA estático inicial.

---

## [ADR-002] Estratégia de Invalidação de Cache Dinâmica (v2.0.0)

**Data:** 2026-05-07
**Contexto:** Arquivos essenciais como `produtos.js` e `ops.js` estavam sendo fortemente cacheados pelos navegadores dos dispositivos móveis do chão de fábrica (Chrome/Safari iOS). Isso gerava disparidades, pois a produção visualizava e apontava para OPs que já haviam sido encerradas ou alteradas.

**Decisão:**
1. Adicionar regras severas de controle no `.htaccess`.
2. Substituir as tags estáticas `<script>` no final do HTML por um carregador dinâmico sequencial escrito em JavaScript nativo.
3. Este carregador adiciona a query string `?v=[timestamp]` aos arquivos DB antes de anexá-los ao DOM, impossibilitando a leitura pelo cache local.

**Consequências:**
- **Positivas:** Operadores *sempre* consumirão a carga de dados exata do momento em que recarregam a página.
- **Negativas:** Leve aumento no consumo de banda na rede Wi-Fi interna da fábrica, dado que scripts extensos (como `produtos.js` de ~2MB) serão trafegados em todo refresh. (Mitigação recomendada no futuro: Service Workers granulares com Cache Validation ETag).

---

## [ADR-003] Regras de Validação Dinâmica de Quantidades e Peso por Unidade de Medida (v2.0.1)

**Data:** 2026-05-19
**Contexto:** O sistema original permitia qualquer caractere numérico e decimal no campo de quantidade produzida (`p-qtd`), sem validar se o produto selecionado aceitava valores fracionários. Isso causava erros operacionais, como apontar frações de peças (ex: `0.5 PC`), o que gerava inconsistências na integração com o ERP. Por outro lado, para produtos com processos de pesagem na zincagem, o campo de peso (`p-peso`) era lido como inteiro, impedindo o cálculo exato de peças por peso fracionário (ex: `1.5 kg`).

**Decisão:**
1. Habilitar dinamicamente a validação de decimais ou inteiros no campo de Quantidade Produzida (`p-qtd`) com base na Unidade de Medida (`um`) do produto selecionado em `produtos.js`.
2. Criar uma lista branca de UMs que admitem ponto decimal (`KG`, `M`, `MT`). Todas as demais UMs (como `PC` e `UN`) são tratadas estritamente como inteiras.
3. Bloquear o caractere vírgula (`,`) em tempo real em todos os inputs decimais (`p-qtd` e `p-peso`), aceitando apenas ponto (`.`) para compatibilidade com o parser de ponto flutuante do JavaScript.
4. Mudar o tratamento do campo `p-peso` no cálculo de zincagem e no envio da API para usar `parseFloat` ao invés de `parseInt`, permitindo a digitação de pesos fracionários e arredondando o número final de peças calculadas para cima (`Math.ceil`).
5. Configurar os atributos `step`, `placeholder` e `inputmode` dos campos dinamicamente para melhorar a acessibilidade e abrir teclados otimizados em dispositivos móveis.

**Consequências:**
- **Positivas:** Redução de erros de digitação no chão de fábrica; validação reativa e imediata na interface; cálculo preciso da produção por pesagem.
- **Negativas:** Exige sincronização precisa da UM no arquivo `produtos.js` exportado do ERP para que as restrições reflitam a regra de negócio correta.

---

## [ADR-004] Restrição de Matrícula (Comprimento Fixo) e Validação Cruzada de O.P. Opcional (v2.0.1)

**Data:** 2026-05-19
**Contexto:** Anteriormente, a matrícula do operador podia ser digitada com qualquer comprimento, o que gerava logs confusos de erros ou inconsistências na integração direta com os cadastros do Protheus. Adicionalmente, o campo de Ordem de Produção (OP) aceitava qualquer número sem realizar uma validação de existência real na base local (`ops.js`), impossibilitando alertas visuais imediatos ao operador no caso de erros de digitação.

**Decisão:**
1. Fixar o comprimento de Matrícula para exatamente 6 números através de `maxlength="6"` no input e verificação de comprimento em tempo real no JavaScript. O check visual (borda verde) só é liberado se a matrícula tiver tamanho 6 e for válida.
2. Manter a OP (Ordem de Produção) como opcional, mas aplicar validação dinâmica caso seja preenchida: o sistema verifica se a OP existe em `db.ops`. Se não existir no arquivo local `ops.js`, a OP recebe borda vermelha e um erro na tela ("OP não encontrada"), bloqueando também a gravação e os testes da API.

**Consequências:**
- **Positivas:** Prevenção antecipada de lançamentos incorretos de OPs inválidas; garantia de que a matrícula possui formato idêntico ao do ERP Protheus.
- **Negativas:** Requer atualização regular do banco de dados de OPs ativas (`ops.js`) no servidor LAMP para evitar falsos negativos ao tentar lançar OPs recém-criadas.

---

## [ADR-005] Preenchimento Automático do Produto por O.P. em Tempo Real (v2.0.2)

**Data:** 2026-05-19
**Contexto:** O sistema permitia que o operador digitasse uma O.P. e associasse manualmente qualquer código de produto, gerando inconsistências no ERP por erros de digitação (ex: apontar um produto que não pertence àquela O.P.). Embora houvesse validação na gravação, era necessário fornecer uma experiência mais fluida que preenchesse os dados automaticamente assim que a O.P. fosse validada.

**Decisão:**
1. Interceptar a digitação do operador no campo de O.P. (`p-op` e `s-op`) em tempo real através do evento `input`.
2. Assim que o valor inserido corresponder a uma O.P. válida no banco de dados local (`db.ops`), o sistema preenche automaticamente os campos de **Produto** e **Descrição**.
3. Adicionar a classe `.user-interacted` a estes campos e chamar `validateLive()` para que o operador receba feedback visual imediato de validação (cor verde de sucesso) sem precisar tirar o foco da caixa de texto ou apertar Enter.

**Consequências:**
- **Positivas:** Elimina a possibilidade de apontamentos inconsistentes ligando o produto errado à O.P.; otimiza a velocidade de preenchimento (UX do operador); fornece feedback visual imediato e reativo.
- **Negativas:** Nenhuma identificada, visto que se o operador optar por apontar sem O.P., o campo de produto continua livre para preenchimento manual normal.

---

## [ADR-006] Fallback de Comunicação Resiliente no Proxy PHP (v2.0.3)

**Data:** 2026-05-20
**Contexto:** O script `proxy.php` dependia exclusivamente da extensão `cURL` para encaminhar as requisições ao ERP Protheus. No entanto, o servidor Apache/PHP (`192.168.50.2`) não possuía a extensão `cURL` ativada, gerando um erro fatal (`500 Internal Server Error`) com resposta vazia sempre que um payload válido era enviado.

**Decisão:**
1. Implementar verificação dinâmica usando `extension_loaded('curl')`.
2. Caso a extensão esteja desativada no servidor, utilizar o método nativo do PHP `file_get_contents` configurado com um contexto de stream HTTP POST (`stream_context_create`).
3. Capturar o código de retorno HTTP do ERP através da variável nativa do PHP `$http_response_header`.

**Consequências:**
- **Positivas:** O proxy torna-se totalmente autônomo e resiliente, funcionando em qualquer servidor PHP sem necessidade de configurar ou ativar extensões no `php.ini`. O front-end passa a receber mensagens de erro detalhadas mesmo em falhas de rede.
- **Negativas:** Nenhuma identificada.

---

## [ADR-007] Prevenção de Apontamentos Duplicados (Idempotência em 3 Camadas) (v2.1.0)

**Data:** 2026-05-29
**Contexto:** O sistema não possuía nenhuma proteção contra o envio de apontamentos duplicados para o Protheus. Em situações de lentidão de rede, timeout ou ansiedade do operador, o mesmo apontamento podia ser enviado múltiplas vezes, gerando registros inconsistentes no ERP. Como o ambiente de chão de fábrica não possui banco de dados relacional acessível pelo PHP, a solução precisava ser baseada em sistema de arquivos.

**Decisão:**
1. **Proxy (PHP):** Implementar idempotência via fingerprint SHA-256 do payload + file locking exclusivo:
   - `normalizePayloadForHash()` ordena chaves recursivamente para hash consistente
   - `hash('sha256', tipo + '|' + json_encode(payload))` gera fingerprint único
   - Arquivos `.lock` e `.json` no diretório temporário do servidor (`sys_get_temp_dir`)
   - Lock exclusivo (`flock` com `LOCK_EX | LOCK_NB`) impede processamento simultâneo
   - Cache de resposta por 15 minutos (TTL) com limpeza probabilística
   - Resposta "incerta" em falhas de rede: cacheia erro 409 para bloquear reenvio
2. **Frontend (JS):** `Set` de submissões em andamento (`pendingSubmissions`) — bloqueia reenvio no cliente antes mesmo de chegar ao proxy
3. **Frontend (JS):** Exclusão do retry automático — `return;` antes da lógica de retry, exibindo apenas modal de erro sem opção de tentar novamente

**Consequências:**
- **Positivas:** Garantia de que nenhum apontamento duplicado é enviado ao Protheus, mesmo sem acesso a banco de dados; bloqueio no cliente e no servidor; resposta incerta em falhas de rede previne duplicidade em cenários de timeout.
- **Negativas:** O cache de 15 minutos pode bloquear reenvios legítimos se o operador precisar corrigir um apontamento dentro da janela; dependência do sistema de arquivos do servidor (diretório temporário precisa ser persistente entre requisições PHP).

---

## [ADR-008] Adequação do Manifest.json para Geração de APK via PWABuilder (v2.1.1)

**Data:** 2026-06-02
**Contexto:** O PWABuilder (ferramenta da Microsoft para empacotar PWAs em APK Android) rejeitava o `manifest.json` por falta de campos obrigatórios: `lang`, `scope`, `categories`, `orientation` e `prefer_related_applications`. O `start_url` relativo (`./index.html`) também causava problemas na geração do Trusted Web Activity (TWA). A descrição curta era considerada insuficiente pela validação da plataforma.

**Decisão:**
1. Adicionar `"lang": "pt-BR"` para declarar o idioma predominante do app.
2. Adicionar `"scope": "/"` para delimitar o escopo de navegação do PWA.
3. Adicionar `"orientation": "portrait-primary"` para fixar a orientação em retrato no APK.
4. Adicionar `"categories": ["productivity", "business"]` para classificação na Play Store.
5. Adicionar `"prefer_related_applications": false`.
6. Alterar `start_url` de relativo (`./index.html`) para absoluto (`/index.html`).
7. Expandir a `description` com texto mais completo.

**Consequências:**
- **Positivas:** O manifest.json agora passa em todas as validações do PWABuilder e Bubblewrap, permitindo gerar APK sem erros.
- **Negativas:** Nenhuma identificada. O manifesto continua compatível com navegadores e PWA convencional.



