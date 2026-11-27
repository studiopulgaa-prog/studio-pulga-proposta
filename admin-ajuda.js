// admin-ajuda.js — aba "Ajuda" do Studio OS: tutorial de cada tela (conteúdo fixo, escrito a partir do código real).
// REGRA: toda mudança em uma tela deve atualizar o tópico correspondente aqui.
// Formato dos textos: só texto; **negrito** marca o nome exato de botões e campos. Tudo entra na tela por textContent.
// Item com perfil: {t: 'texto', p: 'isaque'} aparece só para o Isaque. Tópico com p: 'isaque' idem.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function E(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function B(c, x, f, rot) { var b = E('button', c, x); b.type = 'button'; if (f) b.addEventListener('click', f); if (rot) b.setAttribute('aria-label', rot); return b; }
  function limpa(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  var EU = function () { return window.SP_USUARIO === 'ju' ? 'ju' : 'isaque'; };
  var I = function (t) { return {t: t, p: 'isaque'}; };   // linha só do Isaque

  // ===================== CONTEÚDO =====================
  var T = [
    {id: 'primeiros', titulo: 'Primeiros passos', tela: 'inicio', ir: 'Ir para o Início',
      resumo: 'Como entrar, se achar no menu e encontrar qualquer coisa rápido.',
      serve: 'O Studio OS é o painel do Studio Pulga: propostas, clientes, atendimento do WhatsApp, financeiro e textos num lugar só. Cada pessoa entra com a própria senha e vê só as telas do seu perfil.',
      blocos: [
        {t: 'Entrar', passos: [
          'Abra proposta.studiopulga.com.br/admin.html.',
          'Digite a sua senha no campo **Senha**.',
          'Se o aparelho é só seu, marque **Manter conectado neste aparelho (30 dias)**.',
          'Toque em **Entrar**. O sistema reconhece quem é você pela senha.']},
        {t: 'Andar pelo painel', passos: [
          'No computador, o menu fica na lateral: **Início**, **Atendimento**, **Comercial**, **Clientes** e, para o Isaque, **Financeiro**, **Conteúdo**, **E-mails** e **Ajustes**. Embaixo aparece "Conectado como" com o seu nome.',
          'No celular, o menu fica embaixo: **Início**, **Atendimento**, **Comercial**, **Clientes** e **Mais**. Em **Mais** estão **Buscar**, **Nova proposta**, **Ajuda**, **Abrir o app de atendimento**, **Sair** e, para o Isaque, **Financeiro**, **Conteúdo**, **E-mails** e **Ajustes**.',
          'Para buscar cliente, proposta ou conversa: no computador aperte Ctrl+K (⌘K no Mac) ou clique em **Buscar**; no celular toque na lupa no topo. Digite 2 letras ou mais, use as setas e Enter para abrir.',
          'Em qualquer tela, o botão **?** no cabeçalho abre esta Ajuda no tópico daquela tela. No computador, a tecla ? também abre a Ajuda.']}
      ],
      dicas: ['A Ju vê Início, Atendimento, Comercial e Clientes. Financeiro, Conteúdo, E-mails e Ajustes são só do Isaque, e o servidor também bloqueia.',
        'Tudo o que você faz (mensagens, conversas assumidas, anotações) fica com o seu nome.'],
      cuidado: ['Em aparelho que não é seu, não marque "Manter conectado" e saia no fim (veja o tópico Segurança).']},

    {id: 'inicio', titulo: 'Início', tela: 'inicio',
      resumo: 'O resumo do dia: números do mês e o que precisa de ação agora.',
      serve: 'Mostra numa tela só o que pede atenção hoje: quem está esperando resposta, cobranças, propostas quentes e o que aconteceu por último.',
      blocos: [
        {t: 'Ler os números do topo', passos: [
          I('**Recebido no mês**: o que entrou no Asaas no mês, comparado com o mesmo período do mês anterior. Se houver meta, aparece a barra de progresso. Sem meta, toque em **definir meta** (vai para Ajustes).'),
          I('**Em aberto · atrasado**: total a receber e quanto já está atrasado.'),
          '**Propostas no mês**: quantas fecharam no mês, quantas estão ativas e abertas e a conversão.',
          '**Conversas aguardando**: conversas do WhatsApp esperando alguém da equipe.',
          'Toque em um número para ir direto para a tela dele.']},
        {t: 'Usar as filas', passos: [
          '**Precisam de resposta**: conversas esperando a equipe, com o tempo de espera. Toque para abrir a conversa.',
          I('**Cobranças**: vence hoje, atrasadas, aviso de pausa enviado (D+5) e clientes pausados. Toque para abrir a ficha do cliente.'),
          '**Propostas quentes**: abriram 2 vezes ou mais nos últimos 14 dias sem decidir, ou vencem hoje/amanhã. Toque para abrir a proposta.',
          '**Follow-up de propostas**: lista de propostas com algo a fazer, com botões como **Fechou**, **Renovar**, **WhatsApp**, **Ainda não decidiu** e **Confirmar nicho**.',
          'Cada fila mostra até 5 itens; **Ver todos** abre a lista completa.']}
      ],
      dicas: ['Itens parados há mais de 30 dias não aparecem aqui. Para vê-los, use o filtro **Antigas (+30 dias)** no Comercial.',
        '**Atividade recente** mostra o que clientes fizeram nas propostas, mensagens do WhatsApp e pagamentos, com o horário.']},

    {id: 'atend', titulo: 'Atendimento (WhatsApp)', tela: 'atend',
      resumo: 'Responder clientes, assumir conversas, notas internas, janela de 24h e o robô.',
      serve: 'Aqui chegam todas as mensagens do WhatsApp de suporte. O robô (IA e menu) responde sozinho; quando o cliente pede uma pessoa ou alguém da equipe assume, o robô fica quieto e vocês respondem por aqui.',
      blocos: [
        {t: 'Encontrar a conversa', passos: [
          'Abra **Atendimento**. As não lidas ficam em cima.',
          'Use os filtros: **Todas**, **Não lidas**, **Precisam de humano**, **Comigo** (as que você assumiu) e **Visitantes** (números que ainda não são clientes confirmados).',
          'Ou digite em **Buscar conversa** (nome, cliente ou final do telefone).',
          'A etiqueta mostra a situação: **Com a IA**, **Aguardando humano**, **Com a equipe**, **Visitante** ou **Resolvida**. Ao lado aparece quem está atendendo.']},
        {t: 'Responder', passos: [
          'Toque na conversa. No topo aparecem nome, cliente e se o número é **Verificado**.',
          'Embaixo, com **Mensagem** selecionado, escreva e toque em **Enviar** (no computador: Ctrl+Enter).',
          'Para textos prontos, toque em **Respostas rápidas** e escolha uma. Para mudar a lista, use o menu **⋯** › **Editar respostas rápidas**.',
          'Quando você responde, o robô fica em pausa nessa conversa pelas horas definidas em Ajustes (padrão 12 h) e a conversa passa a ser sua se ninguém tinha assumido.']},
        {t: 'Assumir, devolver e resolver', passos: [
          '**Assumir**: a conversa passa para você e o robô para de responder por 24 h. Use quando for cuidar do assunto.',
          '**Devolver p/ IA**: o robô volta a responder nessa conversa.',
          '**Resolver**: tira a conversa da lista **Todas** e devolve para a IA. Antes de resolver, se quiser registrar o que foi feito, escreva um **Comentário interno** (veja abaixo). Se o cliente escrever de novo, a conversa volta sozinha.',
          'Se a conversa está com outra pessoa, o botão aparece como "Assumir (está com …)".',
          '**Ficha** abre a ficha do cliente.']},
        {t: 'Comentário interno (nota que o cliente não vê)', passos: [
          'Na conversa, toque em **Comentário interno**.',
          'Escreva o recado para a equipe e toque em **Salvar**.',
          'O comentário aparece na conversa com fundo diferente e o nome de quem escreveu. Ele nunca é enviado ao cliente.']},
        {t: 'Janela de 24 horas e modelos', passos: [
          'O WhatsApp só deixa mandar texto livre até 24 h depois da última mensagem do cliente. Enquanto a janela está aberta, aparece "Janela aberta:" com o tempo que falta.',
          'Quando fecha, aparece "A janela de 24h fechou." Preencha o primeiro nome e o assunto e toque em **Enviar "retomar conversa"**. É um modelo aprovado pela Meta.',
          'Quando o cliente responder, a janela abre de novo e você volta a escrever normalmente.']},
        {t: 'Como o robô atende', passos: [
          'Visitante recebe o menu **Conhecer os planos**, **Já sou cliente** e **Falar com a equipe**.',
          'Em **Já sou cliente**, o robô pede o CNPJ. Se o CNPJ estiver cadastrado, manda um código de 6 números para o **e-mail do responsável** (vale 10 minutos). O cliente digita o código no WhatsApp e o número fica confirmado.',
          'Por segurança, o robô responde sempre igual, exista ou não o CNPJ. 3 códigos errados bloqueiam o número por 24 h e a equipe é avisada. No máximo 3 códigos por dia por número. A confirmação vale 90 dias; depois o robô pede de novo.',
          'Cliente confirmado recebe o menu **Plano e conteúdo**, **Financeiro**, **Gravação**, **Enviar material** e **Falar com a equipe**.',
          'Todo número confirmado pelo WhatsApp entra como **Equipe**. Só o **Responsável** vê o financeiro (boletos, pix, nota). Para os outros, o robô diz que esse assunto é só com o responsável.',
          I('Para promover um número a Responsável: Clientes › abra o cliente › **Editar cadastro** › em **Números de WhatsApp**, troque o **Perfil** para **Responsável**. Salva na hora ("Perfil atualizado.").'),
          {t: 'Para promover um número a Responsável, peça ao Isaque (é feito no cadastro do cliente).', p: 'ju'},
          'Quando alguém pede para falar com a equipe, o robô avisa o cliente (fora do horário, seg. a sex. das 9h às 18h, diz quando vão responder), a conversa vira **Aguardando humano** e a equipe recebe o alerta. Se ninguém da equipe responder em 24 h, o robô volta a atender na próxima mensagem do cliente.']},
        {t: 'Alertas', passos: [
          'Pedidos de atendimento humano, números novos, números bloqueados e etapas importantes da cobrança geram alertas.',
          'Os alertas vão por WhatsApp para os números cadastrados em Ajustes ("Números que recebem alertas"), aparecem na linha do tempo da ficha do cliente e viram notificação no celular de quem ativou (veja App no celular).',
          'Responder pelo app WhatsApp Business do celular também pausa o robô nessa conversa.']}
      ],
      dicas: ['O número ao lado de **Atendimento** no menu é o total de mensagens não lidas.',
        'Sem internet, a mensagem fica como "Na fila" e vai sozinha quando a conexão voltar.',
        'Com o WhatsApp em modo simulação, nada sai para o cliente: aparece "Registrado (modo simulação)".'],
      cuidado: ['Comentário interno é só para a equipe; mensagem com **Mensagem** selecionado vai para o cliente. Confira qual está marcado antes de enviar.',
        'Nunca mande senha, dados de cartão ou dados bancários pelo chat.']},

    {id: 'app', titulo: 'App no celular', href: '/atendimento.html', ir: 'Abrir o app de atendimento',
      resumo: 'Instalar o app de atendimento, ativar notificações e o login da Ju.',
      serve: 'O app "Atendimento" é a tela de conversas do WhatsApp num ícone do celular, com aviso quando chega mensagem para a equipe.',
      blocos: [
        {t: 'Instalar no Android (Chrome)', passos: [
          'Abra proposta.studiopulga.com.br/atendimento.html no Chrome.',
          'Digite a senha, deixe marcado **Manter conectado neste celular (30 dias)** e toque em **Entrar**.',
          'No menu ⋮ do Chrome, toque em **Instalar app** (ou **Adicionar à tela inicial**).']},
        {t: 'Instalar no iPhone (Safari)', passos: [
          'Abra o mesmo endereço no Safari e entre com a senha.',
          'Toque em Compartilhar › **Adicionar à Tela de Início**.',
          'Abra sempre pelo ícone "Atendimento". No iPhone, as notificações só funcionam com o app instalado assim.']},
        {t: 'Ativar as notificações', passos: [
          'Dentro do app, toque em **Ativar notificações neste celular** (no aviso do topo ou no menu **⋯**) e permita.',
          'Confira no menu **⋯** › **Testar notificação**.',
          'Faça isso em cada celular, com a senha de cada pessoa.',
          'Chega aviso quando: entra mensagem em conversa com a equipe, alguém pede atendimento humano, um visitante novo escreve e, para o Isaque, alertas importantes de cobrança. Conversa que o robô está resolvendo não avisa, a menos que **Notificar todas as mensagens** esteja ligado em Ajustes.']},
        {t: 'Login da Ju', passos: [
          I('Crie a variável ATENDIMENTO_SENHA_JU no Vercel (senha diferente da sua) e faça o redeploy.'),
          'A Ju abre o endereço do app no celular dela, entra com a senha dela, instala e ativa as notificações.',
          'O app mostra "Conectado como" no menu **⋯**.']}
      ],
      dicas: ['O menu **⋯** do app também tem **Atualizar agora**, **Editar respostas rápidas**, **Abrir o Studio OS** e **Sair deste aparelho**.',
        'A prévia da notificação nunca mostra valores, números longos ou links.'],
      cuidado: ['Se o celular for trocado ou perdido, entre no app em outro aparelho e mude a senha no Vercel (peça ajuda ao Claude).']},

    {id: 'propostas', titulo: 'Propostas (Comercial)', tela: 'propostas',
      resumo: 'Funil, situação de cada proposta, link, validade e envio.',
      serve: 'O Comercial mostra todas as propostas em funil, tabela ou histórico, e o detalhe de cada uma: quem abriu, o que escolheu, o link e os envios.',
      blocos: [
        {t: 'Ver o funil', passos: [
          'Abra **Comercial**. Escolha a visão: **Funil**, **Tabela** ou **Histórico** (a lista completa com busca e filtros de antes).',
          'As colunas do funil são **Enviada**, **Abriu**, **Em conversa**, **Fechou** e **Perdida/Expirada**.',
          'Cada cartão mostra nicho, valor, dias na etapa (amarelo acima de 7, vermelho acima de 14), aberturas e última atividade. "Quente" = abriu 2 vezes ou mais nos últimos 14 dias.',
          'Filtros: nicho, **Todo o período**/**30 dias**/**90 dias**, **Só quentes** e **Antigas (+30 dias)**.',
          'No topo: conversão de cada etapa e **Tempo médio até fechar**.']},
        {t: 'Abrir uma proposta', passos: [
          'Toque no cartão (ou na linha). No computador o detalhe abre ao lado; feche com **Fechar** ou Esc.',
          'Veja a validade ("Vence …"), a **Atividade do cliente** (abriu, viu aba, viu plano, escolheu, clicou no WhatsApp) e os e-mails.',
          '**Copiar link** copia o link exclusivo do cliente.',
          '**WhatsApp** abre um texto pronto (**Envio do link**, **Lembrete** ou **Vence amanhã**). Revise e toque em **Abrir WhatsApp**. Sem número cadastrado, ele pede o número antes (**Trocar número** muda depois).',
          '**E-mail** envia (ou reenvia) a proposta por e-mail. Só funciona com e-mail cadastrado e proposta ativa.']},
        {t: 'Mudar a situação', passos: [
          'Em **Situação**, escolha **Aguardando**, **Ainda não decidiu**, **Escolheu**, **Fechou** ou **Perdido**. Embaixo aparece o que isso faz com os lembretes por e-mail.',
          '**Marcar "Em conversa"** coloca a proposta na coluna Em conversa do funil (**Tirar de "Em conversa"** desfaz).',
          'Em **Gerenciar**: **Renovar validade** (ou **Reativar validade**/**Reativar proposta**) pede quantos dias; **Duplicar** cria uma nova a partir desta; **Pausar e-mails desta proposta**/**Retomar e-mails desta proposta**; **Nicho e cliente mulher** (ou **Confirmar nicho**) decide os e-mails de datas especiais.']}
      ],
      dicas: ['O status da proposta: **Ativa** (link abre), **Expirada** (passou da validade, link bloqueado) e **Cancelada**. Uma proposta expirada pode ser reativada.',
        '"Aberta em mais de 3 aparelhos" avisa que o link pode ter sido repassado.',
        'Propostas com nome começando com "Teste" contam como teste.'],
      cuidado: ['**Cancelar proposta** e **Mover para a lixeira** bloqueiam o link na hora. A lixeira guarda por 30 dias e depois apaga de vez.']},

    {id: 'nova', titulo: 'Nova proposta', tela: 'nova',
      resumo: 'Criar o link exclusivo, escolher modelo, validade e valores.',
      serve: 'Gera o link exclusivo que o cliente abre para ver a proposta.',
      blocos: [
        {t: 'Criar', passos: [
          'Toque em **Nova proposta** (no Comercial, no Início ou em **Mais**).',
          '**1 · Cliente**: preencha **Nome do cliente**. **E-mail do cliente (opcional)** liga os lembretes por e-mail. **WhatsApp do cliente (opcional)** guarda o número para o botão WhatsApp. Marque **Cliente mulher** se for o caso (campanha do Dia da Mulher).',
          '**2 · Modelo**: **Arquiteto**, **Loja**, **Cardápio** ou **Especial Milão**. Confira o nicho; para trocar, toque em **Alterar**.',
          '**3 · Validade e valores**: escolha **1 dia**, **2 dias**, **3 dias**, **5 dias**, **7 dias** ou **Outra** (1 a 30).',
          'Para mudar valores ou itens só deste cliente, abra **Ajustar valores e itens deste cliente** (os Padrões não mudam).',
          'Toque em **Gerar e copiar link** ou, com e-mail preenchido, **Gerar e enviar por e-mail**.']},
        {t: 'Depois de gerar', passos: [
          'Aparece o link curto. Use **Copiar link**, **Copiar mensagem** ou **Compartilhar** (celular).',
          '**Mostrar link completo** mostra o link longo, se precisar.',
          'A proposta já aparece no Comercial, na coluna **Enviada**.']}
      ],
      dicas: ['No Cardápio dá para escolher as abas que o cliente vê, colocar vídeo de abertura, observação e um valor de plano de entrada só para ele.',
        'Os valores padrão de cada modelo ficam em Ajustes › Padrões.'],
      cuidado: ['A validade conta a partir de agora. Depois que expira, o link não abre até você renovar.']},

    {id: 'clientes', titulo: 'Clientes', tela: 'clientes',
      resumo: 'Cadastro, números do WhatsApp, Asaas, ficha e anotações.',
      serve: 'Lista os clientes com contrato e abre a ficha de cada um: situação financeira, conversas, proposta, onboarding, arquivos e anotações.',
      blocos: [
        {t: 'Ver a lista', passos: [
          'Abra **Clientes**. A tabela mostra empresa, plano, vencimento, situação financeira, números no WhatsApp e onboarding.',
          'Filtros: **Todos**, **Em dia**, **Atrasados**, **Pausados**, **Sem responsável verificado** e **Encerrados**. Ou busque pelo nome.',
          'Toque na linha para abrir a ficha.']},
        {t: 'Usar a ficha', passos: [
          'Ações rápidas: **WhatsApp** (abre a conversa ou o WhatsApp do responsável), **E-mail**, **Copiar senha do onboarding** (copia o link do formulário e a senha), **Drive** e **Manual**.',
          'Abas: **Visão geral** (dados, números e linha do tempo), **Conversas**, **Financeiro**, **Proposta/Contrato**, **Onboarding**, **Arquivos** e **Anotações**.',
          'Em **Anotações**, escreva e toque em **Salvar anotação**. Fica com o seu nome e a data. Só a equipe vê.']},
        {t: 'Cadastrar cliente', p: 'isaque', passos: [
          'Toque em **Novo cliente**.',
          'Preencha **Empresa**, **Contato principal**, **CNPJ** (só números) e **E-mail do responsável**. Os três (empresa, CNPJ e e-mail) são obrigatórios: é para esse e-mail que vai o código do WhatsApp.',
          'Toque em **Buscar no Asaas pelo CNPJ**: o campo **Cliente no Asaas** (cus_…) é preenchido sozinho. Se houver mais de um cliente com o mesmo CNPJ no Asaas, ele mostra os IDs para você colar o certo.',
          'Escolha **Vencimento** (dia 10 ou dia 20) e a **Cláusula de atraso no contrato** (ex.: 5.4; aparece no aviso de pausa).',
          '**Pausa automática no 6º dia**: "sim (padrão do contrato)" pausa os serviços sozinho no 6º dia de atraso; "não pausar automaticamente" só avisa a equipe.',
          'Preencha os links: **Manual de gravação (link)**, **Pasta do Drive**, **Formulário de onboarding (link)** e escolha a **Senha do onboarding**.',
          'Toque em **Salvar cliente**.']},
        {t: 'Adicionar números de WhatsApp', p: 'isaque', passos: [
          'Depois de salvar, aparece **Números de WhatsApp** (para cliente que já existe: ficha › **Editar cadastro**).',
          'Preencha **Telefone**, **Nome** e **Perfil** (**Responsável** ou **Equipe**) e toque em **Adicionar número**.',
          'O número só fica confirmado depois que a pessoa manda o CNPJ e o código no WhatsApp. Até lá aparece "aguardando confirmação".',
          'Para trocar o perfil depois, mude o **Perfil** na linha do número. Número bloqueado tem o botão **desbloquear**; **remover** tira o número do cliente.']}
      ],
      dicas: ['Cliente **Encerrado** não recebe o código do WhatsApp nem a cobrança automática.',
        {t: 'Cadastrar e editar clientes é com o Isaque.', p: 'ju'}],
      cuidado: [I('O e-mail do responsável é quem libera o financeiro no WhatsApp. Confira com o cliente antes de salvar.')]},

    {id: 'fin', titulo: 'Financeiro', tela: 'fin', p: 'isaque',
      resumo: 'Cobranças do Asaas, régua do WhatsApp e cobranças sem vínculo.',
      serve: 'Mostra o que entrou, o que está para receber e o que está atrasado (dados lidos do Asaas, nada é alterado lá) e em que ponto da régua de cobrança está cada cliente.',
      blocos: [
        {t: 'Ler a tela', passos: [
          'No topo: **Recebido no mês**, **A receber**, **Atrasado** e **Clientes pausados**.',
          'Filtros: **Todas**, **Atrasadas**, **Vencem em 7 dias** e **Clientes pausados**.',
          'Na tabela, a coluna **Régua** mostra os avisos já feitos e **Próxima ação** o próximo. Etapas: D-3 (lembrete), D0 (vence hoje), D+2 (pagamento não identificado), D+5 (aviso de pausa), D+6 (pausa), D+10 (a régua para e a equipe decide). Um * indica simulação.',
          'Toque na linha para abrir a ficha do cliente; **Asaas** abre a cobrança.']},
        {t: 'Ações', passos: [
          '**Pular régua**: para os avisos automáticos daquela cobrança (pede confirmação; o Asaas continua igual).',
          '**Reativar cliente**: tira o cliente da pausa.',
          '**Simular a régua de hoje**: mostra o que sairia hoje, sem enviar nada.',
          'Quando o pagamento cai no Asaas, o cliente pausado pela régua volta sozinho para ativo (se não tiver outra cobrança atrasada).']},
        {t: 'Cobrança "(sem vínculo)"', passos: [
          'Significa que a cobrança existe no Asaas, mas o cliente dela não está ligado a nenhum cadastro em Clientes. Sem vínculo, a régua do WhatsApp não manda nada para ele e a linha não abre ficha.',
          'Para resolver: vá em **Clientes**, abra o cliente (ou **Novo cliente**), toque em **Editar cadastro** › **Buscar no Asaas pelo CNPJ** (ou cole o ID cus_… em **Cliente no Asaas**) e **Salvar cliente**.',
          'Volte ao Financeiro: a linha passa a mostrar o nome do cliente.']}
      ],
      dicas: ['Os avisos de cobrança vão só para números **Responsável** já confirmados. Sem responsável confirmado, só o e-mail do Asaas vai, e a equipe é avisada nas etapas D+5 e D+6.'],
      cuidado: ['Com o WhatsApp em simulação, nada sai para o cliente: a régua só registra.']},

    {id: 'conteudo', titulo: 'Conteúdo e Cardápio', tela: 'conteudo', p: 'isaque',
      resumo: 'Textos da página, e-mails, WhatsApp e valores do Cardápio. Rascunho e publicar.',
      serve: 'Edita os textos que o cliente vê (página da proposta de cada modelo, inclusive Cardápio e Especial Milão), os e-mails automáticos, as datas especiais, as mensagens de WhatsApp e os dados de contato, sem precisar de programador.',
      blocos: [
        {t: 'Editar e publicar', passos: [
          'Abra **Conteúdo** e escolha a seção: **Página** (Arquiteto, Loja, Cardápio, Especial Milão), **E-mails** (inclusive **Datas especiais**), **WhatsApp** › **Mensagens**, **Dados gerais** › **Contato e assinatura** ou **Histórico** › **Versões publicadas**.',
          'Edite os campos. Use **Negrito** para destacar e as variáveis [Nome], [data], [link], [item], [valor] onde for permitido. **Ver prévia** mostra como fica.',
          '**Salvar rascunho** guarda sem mudar nada para os clientes ("Rascunho salvo. Nada mudou para os clientes ainda.").',
          '**Publicar** mostra o que muda e coloca no ar na hora, sem deploy. Vale para as propostas novas; marque **Aplicar também às propostas ativas** se quiser que quem já tem o link veja o texto novo.']},
        {t: 'Voltar atrás', passos: [
          'Em **Histórico** › **Versões publicadas**, escolha a versão e toque em **Voltar para esta versão** (vai para o rascunho). Depois toque em **Publicar**.',
          '**Restaurar original** volta um campo para o texto de fábrica.']},
        {t: 'Valores do Cardápio e dos planos', passos: [
          'Os valores e itens ficam em **Ajustes** › Padrões: escolha **Planos de gestão** ou **Cardápio**.',
          'Altere e toque em **Salvar como novo padrão**. Vale para as próximas propostas; as já enviadas não mudam.',
          '**Restaurar padrão de fábrica** volta aos valores originais (só vale depois de salvar).']}
      ],
      dicas: ['O topo mostra a versão publicada e se há alterações ainda não publicadas.', 'Datas especiais podem ser "Data única" ou "Todo ano".'],
      cuidado: ['Publicar é na hora: confira a prévia antes. E-mails automáticos e mensagens de WhatsApp sempre usam a versão publicada mais recente.']},

    {id: 'emails', titulo: 'E-mails', tela: 'emails', p: 'isaque',
      resumo: 'Envios automáticos das propostas: o que saiu, o que vai sair e quem está bloqueado.',
      serve: 'Acompanha os e-mails automáticos das propostas (envio do link, lembrete, último aviso, datas especiais, confirmação do plano e resumo semanal).',
      blocos: [
        {t: 'Ler a tela', passos: [
          'O topo diz se está em **Modo SIMULAÇÃO** (nada vai para os clientes; o sistema só registra como "Simulado") ou **Envios LIGADOS**.',
          '**Próximos envios (7 dias)**: o que está agendado.',
          '**Enviados e registrados (últimos)**: o que saiu, com a situação (Entregue, Rejeitado, Spam…).',
          '**Bloqueados (não recebem mais nada)**: e-mails rejeitados, marcados como spam ou de quem pediu para sair.',
          '**Enviar teste para mim**: manda um exemplo com dados fictícios para o e-mail de teste.']},
        {t: 'Parar ou religar os e-mails de uma proposta', passos: [
          'No detalhe da proposta, toque em **E-mails desta proposta** para ver o histórico dela.',
          'Use **Pausar e-mails desta proposta** / **Retomar e-mails desta proposta**, ou mude a **Situação** (Escolheu e Fechou param os lembretes).']}
      ],
      dicas: ['Os lembretes saem em dia útil, entre 9h e 11h.'],
      cuidado: ['Quem pediu para sair ou marcou como spam não recebe mais nada, e isso não deve ser desfeito.']},

    {id: 'ajustes', titulo: 'Ajustes', tela: 'ajustes', p: 'isaque',
      resumo: 'Padrões, Pixel, metas, usuários, notificações, WhatsApp, modelos da Meta e senhas.',
      serve: 'Configurações gerais do painel e do atendimento.',
      blocos: [
        {t: 'Metas e notificações', passos: [
          'Em **Metas**, preencha **Recebido no mês (R$)** e **Propostas fechadas no mês** e toque em **Salvar metas**. Aparecem nas barras do Início e do Financeiro.',
          'Em **Notificações no celular**, marque **Notificar todas as mensagens (inclusive as que a IA está respondendo)** se quiser aviso de tudo. Salva na hora.']},
        {t: 'Atendimento do WhatsApp', passos: [
          'Em **WhatsApp e onboarding**, escolha **Atendimento (IA, modelos, horário)**.',
          '**Variáveis no Vercel** mostra o que está ok ou falta. **Testar envio (texto)** e **Testar envio (modelo)** mandam para o número de teste.',
          'Preencha **WhatsApp comercial (visitante interessado vai para cá)**, **Números que recebem alertas (Isaque e Ju)** e **Quando a equipe responde pelo celular, a IA fica quieta por (horas)**. Cada um tem o seu **salvar**.',
          '**Aviso de feriado/recesso**: datas de início e fim e o texto; o robô usa nas respostas e trata o período como fora do horário. Toque em **salvar aviso**.',
          '**Manual da IA (o jeito de responder)**: edite e toque em **Salvar manual da IA**. **voltar ao texto padrão** recupera o original.']},
        {t: 'Modelos de mensagem da Meta', passos: [
          'Modelos são mensagens pré-aprovadas pela Meta, usadas fora da janela de 24 h (cobrança, "retomar conversa", alerta da equipe).',
          'Em **Modelos de mensagem (Meta)**, cada modelo mostra a situação: **APPROVED** (aprovado, pode usar), **PENDING** (em análise pela Meta, ainda não pode usar: aguarde a aprovação) e **REJECTED** (recusado, com o motivo).',
          'Toque em **Criar modelos que faltam na Meta** para mandar para aprovação os que ainda não existem. Os que já existem aparecem como "já existia".']},
        {t: 'Senhas do onboarding', passos: [
          'Em **WhatsApp e onboarding**, escolha **Senhas do onboarding**.',
          '**+ Nova senha** cadastra; **mostrar**, **copiar p/ cliente** (copia link + senha) e **editar** em cada linha.',
          'No cadastro do cliente, escolha a senha em **Senha do onboarding** para o botão **Copiar senha do onboarding** funcionar na ficha.']},
        {t: 'Padrões, Pixel e zona de risco', passos: [
          'Padrões: **Planos de gestão** ou **Cardápio** › **Salvar como novo padrão** (veja Conteúdo e Cardápio).',
          '**Meta Pixel**: cole o **ID do Pixel da Meta**, **Salvar** e **Testar**. Roda só na página do cliente.',
          '**Zona de risco**: **Encerrar propostas ativas…** e **Apagar histórico…** agem em lote e sempre pedem confirmação.',
          '**Sair deste aparelho** encerra a sessão.']}
      ],
      cuidado: ['As configurações do WhatsApp valem na hora para todas as conversas.', 'Na Zona de risco, leia a confirmação com calma: as propostas apagadas vão para a lixeira e, depois de 30 dias, são apagadas de vez.']},

    {id: 'seguranca', titulo: 'Segurança', tela: 'ajustes', telaJu: null, sair: true, ir: 'Ir para Ajustes',
      resumo: 'Senhas, bloqueio por tentativas e como sair.',
      serve: 'Cuidados para ninguém de fora acessar o painel e os dados dos clientes.',
      blocos: [
        {t: 'Senha e bloqueio', passos: [
          'Cada pessoa tem a própria senha. Ela é guardada só nas variáveis do Vercel (ADMIN_PASSWORD do Isaque e ATENDIMENTO_SENHA_JU da Ju), nunca no código.',
          'Depois de 5 senhas erradas seguidas, o acesso fica bloqueado por 10 minutos ("Muitas tentativas erradas. Aguarde 10 minutos.").',
          'A sessão dura até 30 dias com "Manter conectado"; sem marcar, acaba ao fechar o navegador.']},
        {t: 'Sair da sessão', passos: [
          I('No computador: **Ajustes** › **Sair deste aparelho**.'),
          'No celular: **Mais** › **Sair**.',
          'No app de atendimento: menu **⋯** › **Sair deste aparelho**.',
          'Ou use o botão **Sair deste aparelho** abaixo.']}
      ],
      cuidado: ['Nunca compartilhe a sua senha, nem por WhatsApp ou e-mail. Se desconfiar que alguém viu, troque a variável no Vercel.',
        'Não peça nem mande senha, cartão ou dados bancários de cliente pelo chat do atendimento.']},

    {id: 'faq', titulo: 'Problemas comuns (FAQ)', tela: 'atend', ir: 'Ir para o Atendimento',
      resumo: 'Robô não respondeu, código que não chegou, notificação, cobrança sem vínculo.',
      serve: 'Respostas rápidas para o que mais acontece.',
      blocos: [
        {t: 'O robô não respondeu o cliente', passos: [
          'Veja a etiqueta da conversa. Em **Com a equipe** ou **Aguardando humano**, o robô fica quieto de propósito (alguém assumiu, respondeu ou o cliente pediu uma pessoa). Para ele voltar, toque em **Devolver p/ IA**.',
          'Se a IA estiver desligada, o robô só mostra o menu. Mensagem de áudio: o robô pede para escrever.',
          'Número bloqueado (3 códigos errados) fica 24 h sem atendimento do robô.',
          I('Com o WhatsApp em modo simulação, nada sai de verdade. Em Ajustes › Atendimento, **Variáveis no Vercel** mostra WHATSAPP_ATIVO e IA_ATIVA.')]},
        {t: 'O cliente diz que não recebeu o código', passos: [
          'O código vai para o **E-mail do responsável** do cadastro, não para o WhatsApp. Peça para olhar o spam.',
          I('Confira no cadastro (ficha › aba **Visão geral**) se o CNPJ e o **E-mail do responsável** estão certos.'),
          {t: 'Peça ao Isaque para conferir o CNPJ e o e-mail do responsável no cadastro.', p: 'ju'},
          'O robô responde igual mesmo quando o CNPJ não está cadastrado: a mensagem não quer dizer que o código foi enviado.',
          'O código vale 10 minutos; depois disso, o cliente manda o CNPJ de novo. São no máximo 3 códigos por dia.',
          'Cliente com situação **encerrado** não recebe código.',
          'Se não der certo, assuma a conversa e resolva com o cliente.']},
        {t: 'A notificação não chega', passos: [
          'No iPhone, o app precisa estar instalado na Tela de Início e aberto pelo ícone.',
          'Toque em **Ativar notificações neste celular** e permita. Depois teste em **⋯** › **Testar notificação**.',
          'Se aparecer "faltam as chaves VAPID", faltam as variáveis VAPID no Vercel. Se aparecer "bloqueadas neste aparelho", libere as notificações nas configurações do celular.',
          'Lembre: conversa com o robô não avisa, a menos que **Notificar todas as mensagens** esteja ligado em Ajustes.']},
        {t: 'Cobrança aparece como "(sem vínculo)"', passos: [
          'A cobrança está no Asaas mas o cliente não está ligado a um cadastro.',
          I('Clientes › abra ou crie o cliente › **Editar cadastro** › **Buscar no Asaas pelo CNPJ** › **Salvar cliente**.'),
          {t: 'Avise o Isaque: ele liga o cliente ao Asaas no cadastro.', p: 'ju'}]},
        {t: 'Aparece "Falta rodar o SQL do Studio OS"', passos: [
          'Algumas funções (anotações, comentário interno, Resolver, Em conversa, notificações) precisam do arquivo db/2026-11-26_studio_os.sql rodado no Supabase.',
          I('Rode o arquivo no SQL Editor do Supabase (ou peça ao Claude).')]},
        {t: 'Não consigo enviar mensagem livre', passos: [
          'Passaram 24 h desde a última mensagem do cliente. Use **Enviar "retomar conversa"** e espere ele responder.']}
      ]}
  ];

  // ===================== TELA =====================
  var A = {q: '', aberto: {}};
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var txtDe = function (x) { return typeof x === 'string' ? x : x.t; };
  var vale = function (x) { if (typeof x === 'string') return true; return !x.p || x.p === EU(); };
  function visiveis() { return T.filter(function (t) { return !t.p || t.p === EU(); }); }
  function textoTopico(t) {
    var L = [t.titulo, t.resumo, t.serve];
    (t.blocos || []).forEach(function (b) { if (!vale(b)) return; L.push(b.t); b.passos.filter(vale).forEach(function (p) { L.push(txtDe(p)); }); });
    (t.dicas || []).filter(vale).forEach(function (d) { L.push(txtDe(d)); });
    (t.cuidado || []).filter(vale).forEach(function (d) { L.push(txtDe(d)); });
    return norm(L.join(' ').replace(/\*\*/g, ''));
  }
  // texto com **negrito** → nós de texto e <b> (sem innerHTML)
  function rico(el, s) {
    String(s).split('**').forEach(function (parte, i) { if (!parte) return; el.appendChild(i % 2 ? E('b', null, parte) : document.createTextNode(parte)); });
    return el;
  }
  function telaDe(t) { return EU() === 'ju' && t.telaJu !== undefined ? t.telaJu : t.tela; }
  function topico(t, abrir) {
    var d = E('details', 'aj-top'); d.id = 'aj-' + t.id; if (abrir) d.open = true;
    var s = E('summary', 'aj-sum'); s.appendChild(E('b', null, t.titulo)); s.appendChild(E('span', null, t.resumo)); d.appendChild(s);
    d.addEventListener('toggle', function () { if (!norm(A.q).trim()) A.aberto[t.id] = d.open; });   // aberto pela busca não fica lembrado
    var c = E('div', 'aj-c'); d.appendChild(c);
    c.appendChild(E('h3', null, 'Para que serve')); c.appendChild(rico(E('p'), t.serve));
    (t.blocos || []).filter(vale).forEach(function (b) {
      c.appendChild(E('h3', null, 'Passo a passo · ' + b.t));
      var ol = E('ol'); b.passos.filter(vale).forEach(function (p) { ol.appendChild(rico(E('li'), txtDe(p))); }); c.appendChild(ol);
    });
    var di = (t.dicas || []).filter(vale);
    if (di.length) { c.appendChild(E('h3', null, 'Dicas')); var ul = E('ul'); di.forEach(function (x) { ul.appendChild(rico(E('li'), txtDe(x))); }); c.appendChild(ul); }
    var cu = (t.cuidado || []).filter(vale);
    if (cu.length) { var bx = E('div', 'aj-cuid'); bx.setAttribute('role', 'note'); bx.appendChild(E('h3', null, 'Cuidado')); var u2 = E('ul'); cu.forEach(function (x) { u2.appendChild(rico(E('li'), txtDe(x))); }); bx.appendChild(u2); c.appendChild(bx); }
    var pe = E('div', 'aj-pe');
    if (t.sair) pe.appendChild(B('os-btn', 'Sair deste aparelho', function () { if (window.logout) logout(); }));
    if (t.href) { var a = E('a', 'os-btn pri', t.ir || 'Ir para esta tela'); a.href = t.href; pe.appendChild(a); }
    else if (telaDe(t)) pe.appendChild(B('os-btn pri', t.ir || 'Ir para esta tela', function () { irPara(telaDe(t)); }));
    c.appendChild(pe);
    return d;
  }
  function render(foco) {
    var sc = $('scrAjuda'); if (!sc) return;
    limpa(sc);
    var hd = E('div', 'scr-hd'); var hx = E('div'); hx.appendChild(E('span', 'mk', 'Como usar o Studio OS')); hx.appendChild(E('h1', 'tt', 'Ajuda')); hd.appendChild(hx); sc.appendChild(hd);
    var bu = E('div', 'busca aj-busca'); var lb = E('label', 'sr', 'Buscar na ajuda'); lb.htmlFor = 'ajQ'; bu.appendChild(lb);
    if (window.ICO) { var ic = E('span'); ic.innerHTML = ICO('search', 18); if (ic.firstChild) bu.appendChild(ic.firstChild); }   // ícone fixo do admin (sem dados)
    var inp = E('input', 'inp'); inp.id = 'ajQ'; inp.type = 'search'; inp.placeholder = 'Buscar na ajuda'; inp.autocomplete = 'off'; inp.value = A.q; bu.appendChild(inp); sc.appendChild(bu);
    var st = E('div', 'aj-st'); st.id = 'ajSt'; st.setAttribute('role', 'status'); sc.appendChild(st);
    var idx = E('nav', 'aj-idx'); idx.id = 'ajIdx'; idx.setAttribute('aria-label', 'Tópicos da ajuda'); sc.appendChild(idx);
    var L = E('div', 'aj-lista'); L.id = 'ajLista'; sc.appendChild(L);
    visiveis().forEach(function (t) {
      var c = B('aj-card', null, function () { abreTopico(t.id); }); c.setAttribute('data-aj', t.id);
      c.appendChild(E('b', null, t.titulo)); c.appendChild(E('span', null, t.resumo)); idx.appendChild(c);
      L.appendChild(topico(t, A.aberto[t.id] || t.id === foco));
    });
    inp.addEventListener('input', function () { A.q = inp.value; filtra(); });
    filtra(true);
  }
  function filtra(inicial) {
    var q = norm(A.q).trim(), pal = q ? q.split(/\s+/) : [], n = 0;
    visiveis().forEach(function (t) {
      var ok = !pal.length || (function (tx) { return pal.every(function (p) { return tx.indexOf(p) > -1; }); })(textoTopico(t));
      var d = $('aj-' + t.id), c = document.querySelector('#ajIdx [data-aj="' + t.id + '"]');
      if (d) { d.hidden = !ok; if (ok && pal.length) d.open = true; else if (!pal.length && !inicial) d.open = !!A.aberto[t.id]; }
      if (c) c.hidden = !ok;
      if (ok) n++;
    });
    var st = $('ajSt'); if (!st) return;
    st.textContent = !pal.length ? '' : n ? n + (n === 1 ? ' tópico encontrado' : ' tópicos encontrados') : 'Nada encontrado para "' + A.q + '". Tente outra palavra.';
  }
  function abreTopico(id) {
    var d = $('aj-' + id); if (!d) return;
    if (d.hidden) { A.q = ''; var i = $('ajQ'); if (i) i.value = ''; filtra(); }
    d.open = true; A.aberto[id] = true;
    d.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    var s = d.querySelector('summary'); if (s) s.focus({preventScroll: true});
  }
  // abre a Ajuda (opcional: direto num tópico)
  window.osAjuda = function (topicoId) {
    if (topicoId && !visiveis().some(function (t) { return t.id === topicoId; })) topicoId = null;
    if (!document.getElementById('scrAjuda').classList.contains('on')) { A.foco = topicoId; irPara('ajuda'); return; }
    if (topicoId) { A.q = ''; render(topicoId); setTimeout(function () { abreTopico(topicoId); }, 30); }
  };
  window.osAjudaTela = function () { var f = A.foco; A.foco = null; render(f); if (f) setTimeout(function () { abreTopico(f); }, 30); };

  // ===================== botão "?" no cabeçalho de cada tela =====================
  var CAB = [
    ['#osIni .scr-hd', 'inicio'], ['#scrAtend .ax-hd-ac', 'atend'], ['#osCom .scr-hd', 'propostas'], ['#scrDetalhe .dt-top', 'propostas'],
    ['#secNova .scr-hd', 'nova'], ['#scrClientes .scr-hd', 'clientes'], ['#scrFicha .os-fc-hd', 'clientes'], ['#scrFin .scr-hd', 'fin'],
    ['#scrConteudo .scr-hd', 'conteudo'], ['#scrEmails .scr-hd', 'emails'], ['#scrAjustes .scr-hd', 'ajustes']
  ];
  function poeBotoes() {
    CAB.forEach(function (c) {
      var hd = document.querySelector(c[0]); if (!hd || hd.querySelector('.os-ajuda-b')) return;
      var b = B('os-ajuda-b', '?', function (ev) { ev.stopPropagation(); osAjuda(c[1]); }, 'Ajuda desta tela'); b.title = 'Ajuda desta tela';
      var ac = hd.querySelector('.os-hd-ac');
      if (ac) ac.insertBefore(b, ac.firstChild);
      else if (hd.classList.contains('ax-hd-ac')) hd.insertBefore(b, hd.firstChild);
      else { b.classList.add('so'); hd.appendChild(b); }
    });
  }
  var agend = 0;
  function observa() {
    var m = $('main'); if (!m || !window.MutationObserver) return;
    new MutationObserver(function () { if (agend) return; agend = requestAnimationFrame(function () { agend = 0; poeBotoes(); }); }).observe(m, {childList: true, subtree: true});
    poeBotoes();
  }

  // ===================== atalho "?" e endereço #ajuda =====================
  document.addEventListener('keydown', function (e) {
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement, tg = a && a.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (a && a.isContentEditable)) return;
    if (!$('adminWrap') || $('adminWrap').style.display !== 'block') return;
    if (document.querySelector('#hModal, .os-k.on, .os-dr.on, .os-sheet.on, .ax-rr')) return;
    e.preventDefault(); osAjuda();
  });
  var entrou = window.appEntrou;
  window.appEntrou = function () {
    if (entrou) entrou();
    var m = /^#ajuda(?:=([a-z]+))?$/.exec(location.hash || '');
    if (m) osAjuda(m[1] || null);
  };
  observa();
})();
