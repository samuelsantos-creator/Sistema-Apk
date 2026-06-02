# Changelog

Toda mudança notável neste projeto será documentada neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Alterado
- **manifest.json:** Adicionados campos obrigatórios para compatibilidade com PWABuilder/Bubblewrap — `lang`, `scope`, `orientation`, `categories`, `prefer_related_applications`. Corrigido `start_url` de relativo (`./index.html`) para absoluto (`/index.html`). Descrição expandida para atender requisitos de geração de APK.

### Adicionado
- **Idempotência (3 Camadas):** Implementado sistema de prevenção de apontamentos duplicados:
  - **Proxy PHP:** Idempotência via SHA-256 + file locking — bloqueia requisições idênticas no servidor e cacheia respostas por 15 min
  - **Frontend:** `Set` de submissões em andamento (`pendingSubmissions`) — impede reenvio no cliente enquanto uma requisição idêntica está sendo processada
  - **Frontend:** Retry automático desativado — impede reenvio acidental em erros de comunicação
  - Resposta incerta: em caso de falha de rede, o proxy assume que o Protheus pode ter processado e bloqueia reenvio do mesmo payload por 15 min

### Corrigido
- **Fallback de Comunicação no Proxy PHP:** Corrigido o erro 500 (Internal Server Error) no envio de apontamentos causado pela ausência da extensão `cURL` ativa no servidor `192.168.50.2`. Implementada detecção automática que recorre ao método nativo `file_get_contents` com stream context quando o cURL não está disponível, garantindo resiliência total de envio.

### Adicionado
- **Data na Tela de Confirmação:** Exibição da data selecionada pelo operador (formato simples ou intervalo de datas) nos resumos de confirmação antes do envio de apontamentos de produção e paradas.
- **Validação Tempo Real (Limite 30 Dias):** Implementada validação retroativa rigorosa de 30 dias para campos de data. Agora o sistema aplica a classe CSS `.user-interacted` e dispara a validação visual imediatamente no evento de `blur` (ao sair do campo) ou ao interagir com as setas de ajuste e o calendário nativo. Isso garante feedback instantâneo (borda vermelha e mensagem de erro) antes da tentativa de salvar.
- **Restrição Numérica Strict:** Os campos de **Matrícula** e **OP** foram atualizados para aceitar apenas caracteres numéricos. Foi implementado o atributo `inputmode="numeric"` para otimizar a experiência do operador em tablets e celulares, prevenindo erros de entrada de texto em campos críticos.
- **Sincronização de Dados (produtos.js):** Atualizada a lógica de integração no `app.js` para ser compatível com a nova estrutura de objetos em `produtos.js`. O sistema agora mapeia corretamente as descrições dos produtos através da nova hierarquia `window.APP_DB["produtos"]`, garantindo que o preenchimento automático das descrições funcione perfeitamente com os dados extraídos do ERP.
- **Validação Inteligente de Quantidade (UM):** O campo de **Quantidade Produzida** (`p-qtd`) agora valida e formata a entrada dinamicamente com base na Unidade de Medida (UM) do produto selecionado. Unidades inteiras como `PC` (peça) e `UN` (unidade) bloqueiam a digitação de pontos (`.`) e decimais, enquanto unidades decimais como `KG` (quilo) e `M` / `MT` (metro) liberam o uso do ponto. A vírgula (`,`) é bloqueada globalmente em todas as condições. O processamento interno alterna entre `parseFloat` e `parseInt` dinamicamente conforme necessário.
- **Suporte a Decimais no Peso (Zink):** O campo de **Peso (kg)** (`p-peso`) foi atualizado para usar `parseFloat` (em vez de `parseInt`). Isso permite lançar pesos fracionados (como `1.5` ou `1.769` kg), garantindo que os cálculos de quantidade de peças por peso (Zink) funcionem de forma precisa e arredondem corretamente para cima (`Math.ceil`), além de restringir a digitação de vírgulas e ativar o teclado decimal no mobile.
- **Validação de Matrícula (Comprimento Estrito):** A matrícula do operador agora exige exatamente 6 dígitos numéricos. O input HTML foi limitado com `maxlength="6"` e a validação em tempo real avisa se o tamanho estiver inválido, impedindo o salvamento.
- **Validação Cruzada de O.P.:** A Ordem de Produção (OP) é opcional, mas se o operador optar por preenchê-la, o sistema valida contra o banco local em `ops.js`. Se for inválida, o campo fica com borda vermelha e impede o teste ou a gravação com o erro "OP não encontrada".
- **Preenchimento Automático de Produto por OP:** Quando o operador digita uma O.P. válida (evento `input`), o sistema preenche e valida imediatamente o **Produto** e a **Descrição** correspondentes, aplicando a sinalização visual de sucesso (cor verde) e prevenindo erros de digitação de produtos associados a O.P.s.

### Corrigido (UI/UX)
- **Alinhamento de Layout (CSS Grid):** Refatorada a estrutura de grade em `main.css` para eliminar a confusão operacional no preenchimento de horários.
  - No **Desktop**: "Hora Inicial" alinhada sob "Data Inicial" (coluna 2) e "Hora Final" sob "Data Final" (coluna 3).
  - No **Mobile**: Campo "Turno" configurado como `span 2` (largura total), mantendo os pares de Data/Hora organizados e empilhados verticalmente de forma intuitiva.
- **Feedback Visual Instantâneo:** Corrigida a latência na exibição de erros; as mensagens de validação agora aparecem assim que o campo perde o foco.

### Alterado
- O `index.html` principal foi purgado de 5500 linhas para o seu esqueleto HTML raiz (1480 linhas).
- Documentação central (`INDEX.md`) reescrita totalmente para abranger a nova arquitetura LAMP.

### Removido
- Removido o comportamento em que variáveis globais estourariam erros por conflito de carregamento assíncrono padrão.
- Funções antigas de testes ("Testar Produção API" via hardcode), mantidas desativadas visando segurança da produção.

### Corrigido
- `TypeError` em `duvidas.js` corrigido: adicionado block listener condicional `if (prog)` para manipulação da barra de scroll.
