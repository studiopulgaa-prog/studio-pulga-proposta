// conteudo-campos.js — lista dos textos editáveis na aba "Conteúdo" do admin (página do cliente, WhatsApp e dados gerais).
// Usado pelo admin (editor) e pela página do cliente (proposta-conteudo.js aplica o que foi publicado).
// "def" é o texto de fábrica (igual ao que está no HTML hoje). Sem nada publicado, a página não muda em nada.
// Formato: só texto; **negrito**; Enter = quebra de linha. Nunca HTML.
(function () {
  var pl = function (n) { return '#plano' + (n - 1); };
  var servicos = [
    ['Filmmaker Mobile', 'Registros rápidos e com qualidade gravados com celular ~ mais orgânicos e naturais para as redes sociais.'],
    ['Editor de Vídeo e Foto', 'Edição e pós-produção profissional de todos os conteúdos captados com o olhar do Studio.'],
    ['Social Media', 'Responsável pelo planejamento, criação e gestão completa das redes sociais da sua marca.'],
    ['Gestor de Tráfego', 'Campanhas pagas no Meta e Google para atrair leads qualificados com foco em resultado real.'],
    ['Drone', 'Vídeos e imagens aéreas para projetos e obras ~ perspectiva única que eleva a percepção da sua marca.'],
    ['Designer Gráfico', 'Criação de materiais digitais e impressos com identidade visual alinhada à essência da sua marca.']
  ];
  var RODAPE = {k: 'rodape', g: 'Rodapé', rot: 'Texto do rodapé', sel: '.footer-proposta .footer-sub', def: '@studio.pulga · Esta proposta é personalizada e confidencial.', max: 200};
  function planos() {
    var L = [
      {k: 'hero_tag', g: 'Abertura', rot: 'Etiqueta acima do nome', sel: 'body > section.hero .hero-tag', def: 'Proposta exclusiva', max: 60},
      {k: 'hero_desc', g: 'Abertura', rot: 'Texto da abertura', sel: 'body > section.hero .hero-desc', def: 'Esta proposta foi preparada especialmente para você após nossa conversa. Ela é válida pelo período indicado acima.', ta: 1, max: 400},
      {k: 'frase', g: 'Abertura', rot: 'Frase de destaque', sel: 'body > section.quote-section .quote-text', def: '// **can I put it** in a pan?', max: 120},
      {k: 'serv_kicker', g: 'Equipe', rot: 'Etiqueta da seção', sel: 'body > section.services-section .services-divider-text', def: 'COM A GENTE', max: 40},
      {k: 'serv_titulo', g: 'Equipe', rot: 'Título da seção', sel: 'body > section.services-section .services-title', def: 'Sua empresa contará com\numa equipe completa.', ta: 1, max: 120}
    ];
    servicos.forEach(function (s, i) {
      var b = 'body > section.services-section .service-card:nth-child(' + (i + 1) + ') ';
      L.push({k: 'serv' + (i + 1) + '_nome', g: 'Equipe', rot: 'Profissional ' + (i + 1) + ' · nome', sel: b + '.service-name', def: s[0], max: 60});
      L.push({k: 'serv' + (i + 1) + '_desc', g: 'Equipe', rot: 'Profissional ' + (i + 1) + ' · descrição', sel: b + '.service-desc', def: s[1], ta: 1, max: 300});
    });
    L.push({k: 'planos_kicker', g: 'Planos', rot: 'Etiqueta da seção', sel: 'body > section.planos-section .planos-divider-text', def: 'ESCOLHA SEU PACOTE', max: 40});
    L.push({k: 'planos_titulo', g: 'Planos', rot: 'Título da seção', sel: 'body > section.planos-section .planos-title', def: 'Planos mensais', max: 80});
    [['Pensado na sua marca', 'Para quem quer construir presença consistente'], ['Sua gestão', 'Gestão completa com diária mensal inclusa'], ['O mais completo', 'Ideal para quem quer presença total']].forEach(function (p, i) {
      var n = i + 1;
      L.push({k: 'p' + n + '_nome', g: 'Planos', rot: n + 'º pacote · nome', sel: pl(n) + ' .plano-nome', def: p[0], max: 60, plano: n});
      L.push({k: 'p' + n + '_sub', g: 'Planos', rot: n + 'º pacote · descrição', sel: pl(n) + ' .plano-subtitle', def: p[1], max: 160});
      L.push({k: 'p' + n + '_botao', g: 'Planos', rot: n + 'º pacote · botão', sel: pl(n) + ' .plano-cta', def: 'Escolher Plano ' + n, max: 40});
    });
    L.push({k: 'selo', g: 'Planos', rot: 'Selo do 2º pacote', sel: '#plano1 .badge-destaque', def: 'MAIS ESCOLHIDO', max: 30});
    L.push({k: 'pagamento', g: 'Planos', rot: 'Formas de pagamento', sel: '#plExtra .pl-pg p', vr: 'PL_PG', def: 'Cobrança mensal no cartão (recorrente), Pix ou boleto. Hoje o fechamento passa por uma confirmação enviada pelo WhatsApp.', ta: 1, max: 400});
    L.push({k: 'duvidas', g: 'Botões', rot: 'Botão de dúvidas', sel: '#plDuv', def: 'Tirar dúvidas no WhatsApp', max: 40});
    L.push(RODAPE);
    return L;
  }
  function cardapio(mi) {
    var L = [];
    if (!mi) {
      L.push({k: 'abertura', g: 'Abertura', rot: 'Frase acima do nome', sel: '#c3Root .c2-open-k', def: '// o seu novo studio,', max: 80});
      L.push({k: 'manif_k', g: 'Manifesto', rot: 'Chamada do manifesto', sel: '#c3Root .c2-mk', def: '// antes de tudo, você precisa saber:', max: 120});
      L.push({k: 'manifesto', g: 'Manifesto', rot: 'Manifesto', sel: '#c3Root .c2-mt', def: 'temos uma identidade **COOL** e **AUTORAL** e não abrimos mão dela.', ta: 1, max: 400});
      L.push({k: 'apoio', g: 'Pacotes', rot: 'Texto antes das abas', sel: '#c3Root .c3-apoio', def: 'Precisa de algo pontual ou de constância no feed? Escolha como prefere começar.', ta: 1, max: 300});
      L.push({k: 'botao', g: 'Botões', rot: 'Botão de fechar o pacote', sel: '#c3Root #c2Go', def: 'Quero este pacote', max: 40});
    } else {
      L.push({k: 'mi_botao', g: 'Botões', rot: 'Botão do Especial Milão', sel: '#c3Root .c3-mi-go', def: 'Quero saber mais', max: 40});
    }
    L.push({k: 'duvidas', g: 'Botões', rot: 'Botão de dúvidas', sel: '#c3Root #c3Duv, #c3DuvF', def: 'Tirar dúvidas no WhatsApp', max: 40});
    L.push(RODAPE);
    return L;
  }
  var C = {
    modelos: [['arq', 'Arquiteto'], ['loja', 'Loja'], ['cd', 'Cardápio'], ['mi', 'Especial Milão']],
    pagina: {arq: planos(), loja: planos(), cd: cardapio(false), mi: cardapio(true)},
    whatsapp: [
      {k: 'envio', rot: 'Envio do link', def: 'Oi, [Nome]! Preparei sua proposta exclusiva: [link]. Ela vale até [data].', ta: 1, max: 1000, req: 1},
      {k: 'lembrete', rot: 'Lembrete', def: 'Oi, [Nome]! Passando pra saber se ficou alguma dúvida sobre a proposta. Ela continua disponível até [data]: [link]. Bora criar com os pulguinhas?', ta: 1, max: 1000, req: 1},
      {k: 'vence', rot: 'Vence amanhã', def: 'Oi, [Nome]! Sua proposta vence amanhã ([data]). Quer fechar, ajustar ou pedir um tempinho a mais? [link]', ta: 1, max: 1000, req: 1}
    ],
    gerais: [
      {k: 'telefone', rot: 'Telefone (rodapé dos e-mails)', def: '(13) 9 9605-7099', max: 20, tel: 1, req: 1},
      {k: 'whatsapp', rot: 'WhatsApp do estúdio (botões da página e dos e-mails)', def: '5513996057099', max: 20, tel: 1, req: 1},
      {k: 'endereco', rot: 'Endereço (rodapé dos e-mails)', def: 'Praia Grande, SP', max: 120, req: 1},
      {k: 'assinatura', rot: 'Assinatura dos e-mails', def: 'Os pulguinhas do Studio Pulga', max: 120, req: 1},
      {k: 'rodape_email', rot: 'Texto extra no rodapé dos e-mails (opcional)', def: '', ta: 1, max: 300}
    ],
    VARS: ['Nome', 'data', 'link', 'item', 'valor']
  };
  // texto -> HTML seguro: escapa tudo, depois **negrito** e quebras de linha
  C.html = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; })
      .replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  };
  window.SP_CAMPOS = C;
})();
