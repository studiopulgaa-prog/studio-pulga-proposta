// api/_campanhas.js — E-MAILS SAZONAIS (somente para propostas que EXPIRARAM sem fechar). Arquivo editável: revise as datas a cada ano.
// Campos:
//   id       nome interno (junto com o ano, é a chave que impede enviar a mesma campanha duas vezes ao mesmo contato)
//   data     'AAAA-MM-DD' (envio único)   OU   anual: 'MM-DD' (repete todo ano)
//   publico  'todos' | 'arquitetos' (tudo que não é modelo Loja) | 'mulheres' (só propostas marcadas "Cliente mulher")
//   assunto  assunto do e-mail
//   corpo    parágrafos (lista de textos). O "[Nome]" vira o primeiro nome do cliente.
//   botao    texto do botão (abre o WhatsApp da Studio Pulga)
// Regras gerais (em api/_sequencia.js): só 9h-11h (Brasília), dia útil, mínimo 7 dias entre e-mails ao mesmo contato,
// máximo 8 por ano, nunca para quem fechou/escolheu plano/se descadastrou/tem proposta ainda válida.
export const MAX_POR_ANO = 8;
export const MIN_DIAS_ENTRE = 7;
export const TOLERANCIA_DIAS = 3; // se o cron falhar no dia, ainda envia até N dias depois (só em dia útil, 9h-11h)

export const FINAL = 'É só responder este e-mail.';
export const BOTAO_PADRAO = 'Falar com a gente';

export const CAMPANHAS = [
  {
    id: 'virada-de-ano', data: '2027-01-05', publico: 'todos',
    assunto: 'Eai? Vai deixar o marketing autêntico só pro fim do ano?',
    corpo: ['Janeiro chegou e a gente tá por aqui, em! 😄 Lets go? Bora criar com os pulguinhas: roteiros, direção criativa e vantagens exclusivas.', "Responde 'bora' que a gente reabre a sua proposta."],
  },
  {
    id: 'carnaval', data: '2027-01-18', publico: 'todos', // Carnaval: terça 09/02/2027
    assunto: 'Tá chegando o Carnaval, em? Vai deixar pra quando?',
    corpo: ['O bloco tá quase na rua e o seu feed ainda no camarim 😅 Bora criar? Luz, câmera e gravação antes da folia.', "Responde 'bora'!"],
  },
  {
    id: 'milao', data: '2027-02-22', publico: 'arquitetos', // Milão: 13 a 20/04/2027
    assunto: 'Milão em abril. Bora pra Itália com os pulguinhas?',
    corpo: ['De 13 a 20 de abril a gente tá em Milão gravando com arquitetos: 2 dias por profissional, vagas contadas e vantagens exclusivas pra quem entrar primeiro. Bora?'],
  },
  {
    id: 'dia-da-mulher', data: '2027-03-08', publico: 'mulheres',
    assunto: 'Feliz Dia da Mulher! 💜',
    corpo: ['Hoje o dia é seu! Que tal celebrar com conteúdo que mostre o melhor de você? Os pulguinhas tão por aqui com luz, câmera e gravação, roteiro e direção criativa pra você brilhar. Lets go?'],
  },
  {
    id: 'dia-do-consumidor', data: '2027-03-15', publico: 'todos',
    assunto: 'Dia do Consumidor: seu cliente tá de olho. E o seu feed?',
    corpo: ['Hoje o consumidor é rei, e ele tá rolando o feed atrás de quem entrega. Bora aparecer bem? Luz, câmera e gravação, com roteiros, direção criativa e vantagens exclusivas pra quem chamar os pulguinhas agora. Lets go?'],
  },
  {
    id: 'dia-das-maes', data: '2027-04-05', publico: 'todos', // Dia das Mães: 09/05/2027
    assunto: 'Dia das Mães em 5 semanas. Já tem pauta?',
    corpo: ['Deixar pra última hora é mandar conteúdo pela fila do correio. Bora criar com os pulguinhas, com tempo e carinho?'],
  },
  {
    id: 'dia-do-arquiteto', anual: '12-08', publico: 'arquitetos', // Dia do Arquiteto: 15/12 (envio 08/12 de cada ano)
    assunto: 'Feliz Dia do Arquiteto! 🎉',
    corpo: ['Parabéns pelo seu dia! Que tal fechar o ano criando e começar o próximo com conteúdo na rua? Os pulguinhas tão por aqui, é só chamar.'],
  },
];

// Feriados em que não se envia (além de sábado e domingo). Revise a cada ano.
export const FERIADOS = [
  '2026-12-25', '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27',
  '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-12-25',
];
