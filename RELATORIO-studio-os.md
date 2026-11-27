# Studio OS — relatório (26/11/2026)

O admin de propostas (`/admin.html`) virou o **Studio OS**, o painel geral do Studio Pulga. Também ganhou um **app de atendimento do WhatsApp** que dá para instalar no celular (`/atendimento.html`).

Não mudou nada em: `proposta.html`, links `?d=` já enviados, fluxo fecharPlano/WhatsApp/e-mail, página de Milão, `privacidade.html`, webhooks (WhatsApp, Asaas), cron da régua e e-mails automáticos.

Continuam **11 funções** no Vercel: as rotas novas entraram em `api/admin.js` e `api/wa.js`, e os módulos novos têm "_" no nome (`api/_os.js`, `api/_push.js`).

## O que mudou

**Visual.**
- Novo `admin-os.css` com fundo creme e terracota só na ação principal.
- Status em verde, âmbar, vermelho ou cinza, sempre com texto junto.
- Bordas de 1 px, números tabulares e o mesmo modelo de página em todas as telas.

**Menu.**
- No computador fica na lateral: Início, Atendimento, Comercial, Clientes, Financeiro, Conteúdo, E-mails e Ajustes.
- No celular fica embaixo: Início, Atendimento, Comercial, Clientes e Mais.
- **Busca global**: Ctrl/⌘+K no computador, lupa no celular. Busca clientes, propostas e conversas.

**Início.**
- Saudação, data e o botão "Nova proposta".
- KPIs:
  - Recebido no mês, com a meta e a comparação com o mês anterior.
  - Em aberto/atrasado.
  - Propostas do mês (ativas, abertas, fechadas e conversão).
  - Conversas aguardando.
- Filas com até 5 itens cada:
  - Precisam de resposta (com o tempo esperando).
  - Cobranças: vence hoje, atrasadas, aviso de pausa e pausadas.
  - Propostas quentes: abriram 2+ vezes em 14 dias, ou vencem hoje/amanhã.
- O follow-up antigo continua no Início.
- Atividade recente.
- Itens parados há mais de 30 dias não aparecem.

**Comercial.**
- Três visões:
  - **Funil**: Enviada → Abriu → Em conversa → Fechou → Perdida/Expirada.
  - **Tabela**.
  - **Histórico**: a lista de antes, com todas as ações.
- Cartões com nicho, valor, dias na etapa (âmbar acima de 7, vermelho acima de 14), aberturas e última atividade.
- Filtros: nicho, período, só quentes e antigas (+30 dias).
- Conversão por etapa e tempo médio até fechar.
- O detalhe abre num painel lateral e tem o botão "Marcar Em conversa".

**Clientes.**
- Tabela com empresa, contato, plano, vencimento, situação financeira, números no WhatsApp e onboarding.
- **Ficha**:
  - Ações rápidas: WhatsApp, e-mail, copiar senha do onboarding, Drive, manual e editar.
  - Abas: Visão geral, Conversas, Financeiro, Proposta/Contrato, Onboarding, Arquivos e Anotações.
  - Linha do tempo unificada.
  - Anotações com autor e data.

**Financeiro** (só Isaque).
- KPIs: recebido no mês, a receber, atrasado e pausados.
- Cobranças com a etapa da régua (D-3, D0, D+2, D+5, D+6, D+10) e a próxima ação.
- Ações "Pular régua" e "Reativar cliente".
- Simulação da régua de hoje e histórico de envios.
- O Asaas é só lido.

**Ajustes** (só Isaque).
- Metas: recebido no mês e propostas fechadas.
- Usuários.
- Notificações ("notificar tudo").
- WhatsApp e Senhas do onboarding, que saíram do menu e vieram para cá.

**Atendimento**: o mesmo app aparece dentro do Studio OS e sozinho no celular.
- Lista com não lidas, estado e dono.
- Filtros: Todas, Não lidas, Precisam de humano, Comigo e Visitantes.
- Conversa no estilo WhatsApp, com autor e status de cada mensagem.
- Ações Assumir, Devolver para a IA e Resolver.
- Comentário interno e respostas rápidas.
- Janela de 24 h:
  - aberta: mostra o tempo restante;
  - fechada: oferece o modelo "retomar conversa".
- Atualiza a cada 5 s só com o app aberto.
- Funciona com sinal fraco: a mensagem fica pendente e é reenviada quando a conexão volta.

**Usuários.**
- **isaque** (tudo) e **ju** (Início, Atendimento, Comercial e Clientes).
- A Ju não acessa Financeiro, Conteúdo, E-mails e Ajustes. O servidor também bloqueia essas ações para ela.
- Quem entra é reconhecido pela senha e a sessão dura até 30 dias.
- Mensagens, conversas assumidas e anotações ficam com o nome de quem fez.
- 5 senhas erradas seguidas bloqueiam por 10 minutos.

**Notificações** (Web Push).
- Avisam quando:
  - chega mensagem numa conversa com a equipe;
  - alguém pede atendimento humano;
  - um visitante novo escreve;
  - acontece um alerta importante de cobrança (só para o Isaque).
- Conversa que a IA está resolvendo não notifica, a menos que "notificar tudo" esteja ligado.
- A prévia nunca mostra valores, números longos ou links.

**Ajuda** (26/11).
- Aba de tutorial em `admin-ajuda.js`, no menu lateral e no "Mais" do celular. A tecla ? abre a Ajuda.
- Tem busca sem acento, índice por tela e um tópico em acordeão para cada tela, com "Para que serve", "Passo a passo", "Dicas", "Cuidado" e "Ir para esta tela".
- Cada perfil só vê os tópicos e as linhas das telas que acessa.
- O botão "?" no cabeçalho de cada tela abre a Ajuda no tópico dela.
**Lixeira e Sair** (27/11).
- **Lixeira:** botão no topo do Comercial para ver e restaurar propostas excluídas. "Apagar de vez" aparece só para o Isaque. Restaurar devolve a proposta ao funil na hora.
- **Sair:** botão **Sair** da Ju no rodapé do menu lateral do computador.
- **REGRA: toda mudança futura em uma tela deve atualizar o tópico correspondente da Ajuda** (em `admin-ajuda.js`), usando o nome exato dos botões.

## Para ligar
1. Rodar `db/2026-11-26_studio_os.sql` no Supabase (SQL editor). A reversão está em `db/2026-11-26_studio_os_REVERSAO.sql`.
   - Antes do SQL tudo funciona, menos anotações, comentário interno, "Resolver", "Em conversa" e notificações. Nesses casos o painel avisa que falta o SQL.
2. Criar no Vercel (projeto studio-pulga-proposta) e fazer redeploy:

   | Variável | O que é |
   |---|---|
   | `ATENDIMENTO_SENHA_JU` | senha da Ju (diferente da `ADMIN_PASSWORD`) |
   | `VAPID_PUBLIC_KEY` | chave pública das notificações |
   | `VAPID_PRIVATE_KEY` | chave privada das notificações (nunca compartilhar) |
   | `VAPID_SUBJECT` | `mailto:contato@studiopulga.com.br` |

   O par de chaves VAPID é gerado uma vez, por exemplo em vapidkeys.com, ou pedindo ao Claude num chat com acesso ao Vercel para criar direto nas variáveis.

## Instalar o app no celular
- **Android (Chrome)**:
  1. Abrir `https://proposta.studiopulga.com.br/atendimento.html` e entrar com a senha.
  2. Menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").
- **iPhone (Safari)**:
  1. Abrir o mesmo endereço.
  2. Botão Compartilhar → "Adicionar à Tela de Início".
  3. Abrir pelo ícone "Atendimento". No iPhone, as notificações só funcionam com o app instalado.

## Ativar as notificações
1. No app instalado, tocar em "Ativar notificações neste celular" (fica no aviso do topo ou no menu ⋯) e permitir.
2. Usar "Testar notificação" no menu ⋯.
3. Fazer isso em cada celular, para cada pessoa.

## Cadastrar a Ju
1. Criar `ATENDIMENTO_SENHA_JU` no Vercel e fazer redeploy.
2. Passar para a Ju o endereço do app e a senha.
3. Ela instala o app, entra e ativa as notificações.

## Testes feitos
- **Telas**: 375 px (WebKit) e 1440 px (Chromium), com os dois perfis. Cobriram Início, funil, tabela, ficha, anotações, Financeiro, Ajustes, busca, conversa, envio, assumir e bloqueios da Ju.
- **App**: login, janela de 24 h aberta e fechada, e envio.
- **Servidor**: 45 testes no Postgres local, com perfis, rate limit, inbox, envio, comentário, push e notas.
- **Sem o SQL novo**: 10 testes.
- **Página do cliente e service worker**: as suítes de antes continuam passando.
