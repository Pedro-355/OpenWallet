# SuggestionCard

A sugestão do dia: um passo pequeno, feito a partir dos dados que a pessoa lançou. No app, aparecem no Início, em "Para hoje" (`apps/web/src/telas/Sugestoes.tsx`).

- **Título** com o fato, em linguagem simples: "DAS do MEI vence em 2 dias".
- **Texto** com a sugestão em forma de convite: "Que tal deixar pago agora? São R$ 86,05."
- **why** é obrigatório na prática: diz de onde veio a sugestão. É o que gera confiança.
- **cta** começa com verbo e leva para onde a pessoa resolve ("Ver agenda", "Ler uma nota").
- "Agora não" nunca pune: a resposta é "Tudo bem. A gente lembra você amanhã." e a sugestão só volta no dia seguinte.
- No máximo três sugestões por dia, com o aviso "Sugestões educativas (...). A decisão é sempre sua."
- Não sugira um produto de investimento específico como o melhor.

Sugestões que o app gera hoje (`montarSugestoes`): vencimento da agenda nos próximos 7 dias ou atrasado, cashback perdido sem CPF na nota e perfil ainda vazio.
