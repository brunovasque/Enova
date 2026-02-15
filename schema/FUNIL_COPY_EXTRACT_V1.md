# FUNIL COPY EXTRACT V1

## __global_interceptores__
- main:
  - Oi! 😊 Tudo bem? | Podemos continuar exatamente de onde paramos. (aprox. linha 3755)
- options:
  - (não identificado)
- fallback:
  - Acho que essa mensagem veio igual à anterior 🤔 | Pode me mandar de outro jeitinho? Só pra eu garantir que entendi certinho. (aprox. linha 3713)
- interruptor: yes
- anchors:
  - pré-switch(stage) loop/repetição e saudação global (aprox. linhas 3713 e 3755)

## inicio
- main:
  - (nenhum literal estático encontrado)
- options:
  - Perfeito, limpamos tudo aqui pra você 👌 | Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida. | Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes? | Me responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 3832)
  - Oi! 👋 | Quer continuar de onde paramos ou prefere começar tudo do zero? | Digite:\n1 — Continuar\n2 — Começar do zero (aprox. linha 3866)
  - Oi! Tudo bem? 😊 | Eu sou a Enova, assistente do programa Minha Casa Minha Vida. | Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes? | Me responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 3893)
  - Perfeito 👌 | Vamos começar certinho. | Eu sou a Enova, assistente do programa Minha Casa Minha Vida. | Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes? | Responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 3919)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'inicio' (aprox. linha 3775)

## inicio_decisao
- main:
  - Perfeito! Vamos continuar de onde paramos 👍 (aprox. linha 3990)
- options:
  - Prontinho! Limpamos tudo e vamos começar do zero 👌 | Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida. | Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes? | Me responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 4016)
- fallback:
  - Só pra confirmar certinho… 😉 | Digite:\n1 — Continuar de onde paramos\n2 — Começar tudo do zero (aprox. linha 3967)
- interruptor: yes
- anchors:
  - case 'inicio_decisao' (aprox. linha 3936)

## inicio_programa
- main:
  - Perfeito, te explico rapidinho 😊 | O Minha Casa Minha Vida é o programa do governo que ajuda na entrada e reduz a parcela do financiamento, conforme a renda e a faixa de cada família. | Eu vou analisar seu perfil e te mostrar exatamente quanto de subsídio você pode ter e como ficam as condições. | Pra começarmos, qual o seu *nome completo*? (aprox. linha 4123)
  - Ótimo, então vamos direto ao ponto 😉 | Vou analisar sua situação pra ver quanto de subsídio você pode ter e como ficariam as condições. | Pra começar, qual o seu *nome completo*? (aprox. linha 4147)
- options:
  - (não identificado)
- fallback:
  - Acho que posso ter entendido errado 🤔 | Só confirma pra mim rapidinho: | Você *já sabe como funciona* o programa Minha Casa Minha Vida, ou prefere que eu te explique de forma bem simples? | Responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 4098)
- interruptor: yes
- anchors:
  - case 'inicio_programa' (aprox. linha 4032)

## inicio_nome
- main:
  - Só pra ficar certinho aqui no sistema 😅 | Me manda seu *nome completo*, tipo: *Bruno Vasques*. (aprox. linha 4226)
  - Perfeito, ${primeiroNome}! 😉 | Agora só pra eu te direcionar certinho... | Me diga seu *estado civil* atual: solteiro(a), casado(a), união estável, separado(a), divorciado(a) ou viúvo(a)? (aprox. linha 4260)
- options:
  - (não identificado)
- fallback:
  - Opa, acho que não peguei certinho seu nome completo 😅 | Me manda de novo, por favor, com *nome e sobrenome* (ex: Ana Silva). (aprox. linha 4200)
- interruptor: yes
- anchors:
  - case 'inicio_nome' (aprox. linha 4162)

## inicio_nacionalidade
- main:
  - Perfeito! 🇧🇷 | Vamos seguir… Qual é o seu estado civil? (aprox. linha 4302)
- options:
  - Obrigado! 😊 | Você possui *RNM — Registro Nacional Migratório*? | Responda: *sim* ou *não*. (aprox. linha 4327)
- fallback:
  - Perdão 😅, não consegui entender. | Você é *brasileiro* ou *estrangeiro*? (aprox. linha 4342)
- interruptor: yes
- anchors:
  - case 'inicio_nacionalidade' (aprox. linha 4275)

## inicio_rnm
- main:
  - Entendi! 👀 | Para financiar pelo Minha Casa Minha Vida é obrigatório ter o *RNM válido*. | Quando você tiver o RNM, posso te ajudar a fazer tudo certinho! 😊 (aprox. linha 4385)
- options:
  - Perfeito! 🙌 | Seu RNM é *com validade* ou *indeterminado*? | Responda: *valido* ou *indeterminado*. (aprox. linha 4411)
- fallback:
  - Só preciso confirmar 🙂 | Você possui *RNM*? Responda *sim* ou *não*. (aprox. linha 4426)
- interruptor: yes
- anchors:
  - case 'inicio_rnm' (aprox. linha 4356)

## inicio_rnm_validade
- main:
  - Obrigado! 👌 | Com *RNM de validade definida*, infelizmente você não se enquadra no Minha Casa Minha Vida atualmente. | Quando mudar para *indeterminado*, posso te ajudar imediatamente! 😊 (aprox. linha 4469)
  - Ótimo! Vamos seguir então 😊 | Qual é o seu estado civil? (aprox. linha 4495)
- options:
  - (não identificado)
- fallback:
  - Só preciso confirmar rapidinho 🙂 | Seu RNM é *válido* (com validade definida) ou *indeterminado*? | Responda apenas: 👉 *válido* ou *indeterminado* (aprox. linha 4509)
- interruptor: yes
- anchors:
  - case 'inicio_rnm_validade' (aprox. linha 4440)

## estado_civil
- main:
  - Perfeito 👌 | E sobre renda… você pretende usar **só sua renda**, ou quer considerar **parceiro(a)** ou **familiar**? (aprox. linha 4571)
  - Entendi! 👍 | Seu casamento é **civil no papel** ou vocês vivem como **união estável**? (aprox. linha 4601)
  - Perfeito! ✍️ | Vocês querem **comprar juntos**, só você, ou **apenas se precisar**? (aprox. linha 4630)
  - Entendi 👍 | Sua separação está **averbada no documento** (RG/Certidão)? (aprox. linha 4659)
  - Perfeito 👌 | Seu divórcio está **averbado no documento**? (aprox. linha 4688)
  - Sinto muito pela perda 🙏 | Você sabe me dizer se o **inventário** já está resolvido? (aprox. linha 4717)
- options:
  - (não identificado)
- fallback:
  - Acho que não entendi certinho 🤔 | Me diga seu *estado civil*: solteiro(a), casado(a), união estável, separado(a), divorciado(a) ou viúvo(a)? (aprox. linha 4741)
- interruptor: yes
- anchors:
  - case 'estado_civil' (aprox. linha 4524)

## confirmar_casamento
- main:
  - Perfeito! 📄 | Então seguimos com vocês **juntos no financiamento**. | Agora me fale sobre seu **tipo de trabalho** (CLT, autônomo, servidor). (aprox. linha 4798)
  - Perfeito! ✍️ | Vocês pretendem **comprar juntos**, só você, ou **apenas se precisar**? (aprox. linha 4828)
  - Conseguiu confirmar pra mim certinho? 😊 | O casamento é **civil no papel**, ou vocês vivem como **união estável**? (aprox. linha 4852)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'confirmar_casamento' (aprox. linha 4755)

## financiamento_conjunto
- main:
  - Perfeito! 👏 | Então vamos considerar a renda de vocês dois. | Primeiro, me fala sobre **você**: trabalha com carteira assinada (CLT), é autônomo(a) ou servidor(a)? (aprox. linha 4908)
  - Perfeito 👍 | Então seguimos só com a sua renda. | Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)? (aprox. linha 4939)
  - Sem problema! 😊 | Vamos começar analisando **só a sua renda**. | Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)? (aprox. linha 4969)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | Vocês querem **comprar juntos**, só você, ou **apenas se precisar**? (aprox. linha 4994)
- interruptor: yes
- anchors:
  - case 'financiamento_conjunto' (aprox. linha 4866)

## parceiro_tem_renda
- main:
  - Perfeito! 👍 | Então vamos incluir a renda dele(a). | Me diga qual é o **tipo de trabalho** do parceiro(a): CLT, autônomo(a) ou servidor(a)? (aprox. linha 5051)
  - Tranquilo! 😊 | Então seguimos só com a sua renda. | Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)? (aprox. linha 5084)
  - Só pra eu entender certinho 😊 | Seu parceiro(a) **tem renda** ou **não tem renda**? (aprox. linha 5111)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'parceiro_tem_renda' (aprox. linha 5008)

## somar_renda_solteiro
- main:
  - Perfeito 👌 | Então seguimos só com a sua renda. | Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)? (aprox. linha 5170)
  - Perfeito! 👏 | Seu parceiro(a) **tem renda própria** ou não tem? (aprox. linha 5204)
  - Show! 👍 | Qual familiar deseja considerar? Pai, mãe, irmão(ã), avô(ó), tio(a)…? (aprox. linha 5237)
  - Só pra eu entender certinho 😊 | Você pretende usar **só sua renda**, somar com **parceiro(a)**, ou somar com **familiar**? (aprox. linha 5263)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'somar_renda_solteiro' (aprox. linha 5125)

## somar_renda_familiar
- main:
  - Perfeito 👌 | Sua mãe trabalha com **carteira assinada**, é **autônoma** ou **servidora**? (aprox. linha 5321)
  - Ótimo! 👍 | Seu pai trabalha com **carteira assinada**, é **autônomo** ou **servidor**? (aprox. linha 5350)
  - Entendi! 👌 | Só me confirma uma coisinha… | **Seu avô/avó recebe aposentadoria rural, urbana ou outro tipo de benefício?** (aprox. linha 5379)
  - Certo! 👍 | Seu tio(a) trabalha com **carteira assinada**, é **autônomo(a)** ou **servidor(a)**? (aprox. linha 5409)
  - Perfeito! 👌 | Seu irmão(ã) é **CLT**, **autônomo(a)** ou **servidor(a)**? (aprox. linha 5438)
  - Entendi 👍 | Seu primo(a) é **CLT**, **autônomo(a)** ou **servidor(a)**? (aprox. linha 5467)
  - Sem problema 😊 | Esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**? (aprox. linha 5496)
  - Perfeito, só me diga qual familiar você quer considerar: | **Pai, mãe, irmão(ã), avô(ó), tio(a), primo(a)**… (aprox. linha 5522)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'somar_renda_familiar' (aprox. linha 5277)

## confirmar_avo_familiar
- main:
  - Perfeito 👌 | Então vamos considerar a renda da aposentadoria rural. | Agora me fala: esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**? Ou só recebe o benefício? (aprox. linha 5579)
  - Perfeito! 👍 | Então vamos considerar a aposentadoria urbana. | E sobre atividade atual… esse familiar trabalha (CLT/autônomo/servidor) ou só recebe o benefício? (aprox. linha 5611)
  - Entendi 👌 | Vamos considerar o benefício informado. | Esse familiar exerce alguma atividade além do benefício? (aprox. linha 5643)
  - Sem problema 😊 | Se souber depois, só me avisar! | Agora me diga: esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**? (aprox. linha 5675)
  - Consegue me confirmar qual é o tipo de benefício **do seu avô/avó**? | Pode ser: rural, urbana, pensão, BPC/LOAS ou outro benefício 👍 (aprox. linha 5702)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'confirmar_avo_familiar' (aprox. linha 5536)

## renda_familiar_valor
- main:
  - Perfeito! 👌 | Então a renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**. | Agora vamos analisar seu histórico de trabalho. | Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos? (aprox. linha 5796)
- options:
  - (não identificado)
- fallback:
  - Acho que não entendi certinho o valor 🤔 | Qual é a **renda mensal** dessa pessoa que vai somar com você? (aprox. linha 5757)
- interruptor: yes
- anchors:
  - case 'renda_familiar_valor' (aprox. linha 5717)

## inicio_multi_renda_pergunta
- main:
  - Perfeito! 👍 | Me diga qual é a *outra renda* e o *valor BRUTO*. | Exemplo: *Bico — 1200* (aprox. linha 5839)
  - Certo! Vamos continuar então 😊 (aprox. linha 5864)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 🙂 | Você possui *mais alguma renda* além dessa? | Responda *sim* ou *não*. (aprox. linha 5875)
- interruptor: yes
- anchors:
  - case 'inicio_multi_renda_pergunta' (aprox. linha 5812)

## inicio_multi_renda_coletar
- main:
  - (nenhum literal estático encontrado)
- options:
  - Ótimo! 👌 | Quer adicionar *mais alguma renda*? | Responda: *sim* ou *não*. (aprox. linha 5951)
- fallback:
  - Não consegui entender certinho 😅 | Envie no formato: *tipo — valor* | Exemplo: *Bico — 1000* (aprox. linha 5910)
- interruptor: yes
- anchors:
  - case 'inicio_multi_renda_coletar' (aprox. linha 5890)

## regime_trabalho
- main:
  - Perfeito! 📄 | E qual é a sua **renda total mensal** (valor bruto que recebe no holerite)? (aprox. linha 6012)
  - Certo! 👍 | E qual é a sua **renda mensal aproximada**, somando tudo? (aprox. linha 6042)
  - Perfeito! 👌 | E qual é a sua **renda total mensal**? (aprox. linha 6072)
  - Entendi! 👍 | E qual é o valor que você **recebe de aposentadoria** por mês? (aprox. linha 6102)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | Você trabalha com **CLT**, é **autônomo(a)**, **servidor(a)** ou **aposentado(a)**? (aprox. linha 6128)
- interruptor: yes
- anchors:
  - case 'regime_trabalho' (aprox. linha 5967)

## inicio_multi_regime_pergunta
- main:
  - Certo! 👍 | Qual é o *outro regime de trabalho*? | Exemplos: | - CLT | - Autônomo | - Servidor público | - Aposentado | - Bicos / informal (aprox. linha 6160)
  - Perfeito! Vamos seguir então 😄 | Agora me informe o *valor BRUTO da sua renda principal* (salário do holerite). (aprox. linha 6178)
  - Perfeito! 👍 | Me diga qual é o *outro regime de trabalho*. | Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*… (aprox. linha 6296)
- options:
  - Certo! 😊 | Agora me diga: você possui *mais alguma renda além dessa*? | Responda *sim* ou *não*. (aprox. linha 6311)
  - Só para confirmar 😊 | Você tem *mais algum regime de trabalho* além desse? | Responda *sim* ou *não*. (aprox. linha 6324)
- fallback:
  - Só pra confirmar: | Você possui *outro regime de trabalho* além daquele que já informou? | Responda: *sim* ou *não*. (aprox. linha 6189)
- interruptor: yes
- anchors:
  - case 'inicio_multi_regime_pergunta' (aprox. linha 6142)
  - case 'inicio_multi_regime_pergunta' (aprox. linha 6276)

## inicio_multi_regime_coletar
- main:
  - Só pra garantir 😅 | Me diga qual é o *regime de trabalho*: | - CLT | - Autônomo | - Servidor público | - Aposentado | - Bicos (aprox. linha 6224)
- options:
  - Perfeito! 👌 | Você possui *mais algum regime de trabalho*? | Responda *sim* ou *não*. (aprox. linha 6261)
  - Ótimo! 👍 | Agora me diga: você possui *mais alguma renda além dessa*? | Responda *sim* ou *não*. (aprox. linha 6376)
- fallback:
  - Acho que não entendi certinho 😅 | Me diga apenas o regime, por exemplo: | 👉 *CLT*\n👉 *Autônomo*\n👉 *Servidor*\n👉 *MEI*\n👉 *Aposentado* (aprox. linha 6355)
- interruptor: yes
- anchors:
  - case 'inicio_multi_regime_coletar' (aprox. linha 6204)
  - case 'inicio_multi_regime_coletar' (aprox. linha 6339)

## regime_trabalho_parceiro
- main:
  - Perfeito! 👍 | E quanto ele(a) ganha por mês, em média? (aprox. linha 6432)
  - Entendi! 😊 | Autônomo(a) também entra no programa, sem problema. | Me diga qual é a **renda mensal média** dele(a)? (aprox. linha 6462)
  - Ótimo! 👌 | Servidor(a) público costuma ter análise rápida. | Qual é o salário mensal dele(a)? (aprox. linha 6493)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | O parceiro(a) trabalha como **CLT**, **autônomo(a)** ou **servidor(a)**? (aprox. linha 6519)
- interruptor: yes
- anchors:
  - case 'regime_trabalho_parceiro' (aprox. linha 6391)

## renda
- main:
  - Perfeito! 👍 | Agora me diga a **renda mensal** do parceiro(a). (aprox. linha 6584)
  - Show! 👌 | Você possui **renda extra**, como comissão, bicos, horas extras ou premiações? (aprox. linha 6596)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar certinho 😊 | Qual é sua **renda mensal aproximada**, em reais? (aprox. linha 6621)
- interruptor: yes
- anchors:
  - case 'renda' (aprox. linha 6533)

## renda_parceiro
- main:
  - Perfeito! 👌 | O parceiro(a) **declara Imposto de Renda**? (aprox. linha 6720)
  - Ótimo! 👍 | A renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**. | Agora me diga: | Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos? (aprox. linha 6750)
- options:
  - (não identificado)
- fallback:
  - Acho que não entendi certinho 🤔 | Qual é a **renda mensal** do parceiro(a)? (aprox. linha 6672)
- interruptor: yes
- anchors:
  - case 'renda_parceiro' (aprox. linha 6635)

## renda_parceiro_familiar
- main:
  - Conseguiu confirmar pra mim o valor certinho? 🤔 | Me diga aproximadamente quanto o(a) familiar ganha por mês. (aprox. linha 6801)
  - Perfeito! 👌 | Agora vou seguir com a análise completa! | Você declara **Imposto de Renda**? (aprox. linha 6842)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'renda_parceiro_familiar' (aprox. linha 6766)

## renda_mista_detalhe
- main:
  - Pode me detalhar certinho? 🤔 | Exemplo: *2000 CLT + 1200 Uber* (aprox. linha 6896)
  - Show! 👏 | Sua renda combinada ficou aproximadamente *R$ ${total}*. | Você declara **Imposto de Renda**? (aprox. linha 6937)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'renda_mista_detalhe' (aprox. linha 6857)

## possui_renda_extra
- main:
  - Perfeito! 👏 | Me diga então quanto você faz por mês nessa renda extra. | Exemplo: *1200 Uber* (aprox. linha 6988)
  - Entendi! 👍 | Mesmo assim vou seguir com sua análise. | Você declara **Imposto de Renda**? (aprox. linha 7015)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | Você tem **alguma renda extra** além do trabalho principal? (aprox. linha 7040)
- interruptor: yes
- anchors:
  - case 'possui_renda_extra' (aprox. linha 6952)

## interpretar_composicao
- main:
  - Perfeito! 👏 | Vamos considerar renda com parceiro(a). | Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?** (aprox. linha 7091)
  - Show! 👏 | Vamos compor renda com familiar. | Qual o **tipo de trabalho** dessa pessoa? (aprox. linha 7118)
  - Entendi! 👍 | Então seguimos só com a sua renda. | Você declara **Imposto de Renda**? (aprox. linha 7145)
  - Pra gente seguir certinho 😊 | Você pretende usar renda de *parceiro(a)*, *familiar*, ou seguir *sozinho(a)*? (aprox. linha 7170)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'interpretar_composicao' (aprox. linha 7054)

## quem_pode_somar
- main:
  - Perfeito! 👏 | Vamos considerar renda com parceiro(a). | Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?** (aprox. linha 7221)
  - Show! 👌 | Vamos compor renda com familiar. | Qual o **tipo de trabalho** dessa pessoa? (aprox. linha 7248)
  - Entendi! 👍 | Seguimos só com a sua renda então. | Você declara **Imposto de Renda**? (aprox. linha 7275)
  - De quem você pretende usar renda para somar? 😊 | Parceiro(a)? Familiar? Ou só você mesmo? (aprox. linha 7300)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'quem_pode_somar' (aprox. linha 7184)

## sugerir_composicao_mista
- main:
  - Boa! 👏 | Vamos considerar renda com parceiro(a). | Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?** (aprox. linha 7350)
  - Perfeito! 👌 | Vamos usar renda de familiar. | Qual o **tipo de trabalho** dessa pessoa? (aprox. linha 7377)
  - Show! 😄 | Com essa renda mista, a melhor forma de conseguir aprovação é somando com alguém. | Quer usar renda de *parceiro(a)* ou de *familiar*? (aprox. linha 7402)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'sugerir_composicao_mista' (aprox. linha 7314)

## ir_declarado
- main:
  - Perfeito! 👌 | Então me diz qual é a sua **renda mensal média**, considerando os últimos 12 meses. (aprox. linha 7516)
  - Show! 👌 | Agora me fala a **renda mensal** do parceiro(a), uma média do que ele(a) vem recebendo. (aprox. linha 7529)
  - Perfeito, isso ajuda bastante na análise. 👌 | Agora me fala: | Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos? (aprox. linha 7541)
  - Tranquilo, dá pra analisar mesmo sem IR. 😉 | Só vou te fazer umas perguntinhas pra entender melhor como conseguimos **comprovar essa renda autônoma**. (aprox. linha 7571)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | Você (ou o parceiro[a]) **declara Imposto de Renda atualmente?** | Pode responder com *sim* ou *não*. (aprox. linha 7461)
- interruptor: yes
- anchors:
  - case 'ir_declarado' (aprox. linha 7417)

## autonomo_compor_renda
- main:
  - Ótimo! 👏 | Então conseguimos usar sua renda como autônomo(a). | Me diga o valor aproximado que você ganha por mês (média dos últimos meses). (aprox. linha 7633)
  - Tranquilo, isso é super comum! 👍 | Quando o cliente é autônomo e **não consegue comprovar**, existem alternativas. | Você pretende somar renda com **parceiro(a)**, **familiar**, ou prefere seguir **sozinho(a)**? (aprox. linha 7665)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 👍 | Você consegue **comprovar sua renda** de autônomo(a) (recibos, notas, extratos ou declaração)? (aprox. linha 7690)
- interruptor: yes
- anchors:
  - case 'autonomo_compor_renda' (aprox. linha 7585)

## ctps_36
- main:
  - Perfeito! 👏 | Agora me diga uma coisinha: | Você tem **dependente menor de 18 anos**? (aprox. linha 7750)
  - Tranquilo, isso acontece bastante! 👍 | Agora me diga: | Você tem **dependente menor de 18 anos**? (aprox. linha 7796)
  - Tranquilo! 👍 | Agora preciso confirmar: | Você está com **alguma restrição no CPF** como negativação? (aprox. linha 7809)
  - Sem problema! 😊 | É só somar o tempo dos últimos empregos. | Diria que chega **próximo** ou **bem distante** dos 36 meses? (aprox. linha 7835)
  - Consegue me confirmar certinho? 😊 | Você possui **36 meses de carteira assinada** nos últimos 3 anos? (aprox. linha 7859)
- options:
  - (não identificado)
- fallback:
  - Perfeito! 👏 | Agora só preciso confirmar: | Você está com **alguma restrição no CPF**? (aprox. linha 7763)
- interruptor: yes
- anchors:
  - case 'ctps_36' (aprox. linha 7704)

## ctps_36_parceiro
- main:
  - Perfeito! 👏 | Agora vamos só confirmar uma coisinha rápida: | Você está com **alguma restrição no CPF**, como negativação? (aprox. linha 7916)
  - Sem problema! 👍 | Agora só mais uma coisinha: | Você está com **alguma restrição no CPF**, como negativação? (aprox. linha 7955)
  - Sem problema! 👍 | Mesmo sem completar os 36 meses, ainda dá pra analisar normalmente. | Vocês têm **dependente menor de 18 anos**? (aprox. linha 7965)
  - Sem pressa 😊 | Normalmente é só somar o tempo de carteira assinada dos últimos empregos. | Diria que está **próximo** ou **bem distante** dos 36 meses? (aprox. linha 7989)
- options:
  - (não identificado)
- fallback:
  - Ótimo! 👏 | Agora só preciso confirmar uma coisa: | Vocês têm **dependente menor de 18 anos**? (aprox. linha 7926)
  - Só pra confirmar certinho 😊 | O parceiro(a) tem **36 meses ou mais** de carteira assinada somando os últimos empregos? (aprox. linha 8011)
- interruptor: yes
- anchors:
  - case 'ctps_36_parceiro' (aprox. linha 7873)

## dependente
- main:
  - Perfeito! ✔️ | Agora me diz uma coisa importante: | Tem alguma **restrição no CPF**? (Serasa, SPC, negativado) (aprox. linha 8228)
  - Perfeito! 👌 | Agora me confirma: | Tem alguma **restrição no CPF**? Serasa ou SPC? (aprox. linha 8270)
  - Ótimo! 👍 | Agora me diz: | Tem alguma **restrição no CPF**? (aprox. linha 8298)
  - Sem problema 😊 | Dependente é apenas **menor de 18 anos** ou alguém que dependa totalmente de você. | Você diria que tem dependente ou não? (aprox. linha 8324)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar 😊 | Você tem **dependente menor de 18 anos**? (aprox. linha 8348)
- interruptor: yes
- anchors:
  - case 'dependente' (aprox. linha 8196)

## restricao
- main:
  - Obrigado por avisar! 🙏 | Com **restrição ativa**, a Caixa exige que o CPF esteja limpo para analisar. | Mas relaxa, vou te orientar certinho. | Você sabe se já está fazendo alguma **regularização**? (aprox. linha 8402)
  - Perfeito! 👌 | Isso ajuda bastante na análise. | Agora vamos pra parte final: preciso de alguns **documentos simples** pra montar sua ficha. Posso te passar a lista? (aprox. linha 8431)
  - Tranquilo, isso é bem comum 😊 | Normalmente você recebe SMS ou e-mail quando tem restrição. | Se quiser, posso te ajudar a verificar isso grátis pelo app da Serasa. | Mas antes: você **acha** que pode ter algo pendente? (aprox. linha 8459)
- options:
  - (não identificado)
- fallback:
  - Só pra confirmar rapidinho 😊 | Tem alguma **restrição** no CPF? (Serasa, SPC) (aprox. linha 8483)
- interruptor: yes
- anchors:
  - case 'restricao' (aprox. linha 8362)

## regularizacao_restricao
- main:
  - Ótimo! 👏 | Quando a restrição sai do sistema, consigo seguir sua análise normalmente. | Enquanto isso, já posso te adiantar a lista de **documentos** pra você ir separando. Quer que eu te envie? (aprox. linha 8535)
  - Tranquilo, isso é bem comum 😊 | Pra Caixa analisar, o CPF precisa estar limpo. | Mas não precisa se preocupar: te mostro o caminho mais fácil pra resolver isso pelo app da Serasa ou banco. | Posso te enviar a **instrução rápida** e já te adiantar a lista de documentos? (aprox. linha 8565)
  - Sem problema 😊 | Se quiser, te ensino a consultar grátis no app da Serasa. | Mas independente disso, já posso te passar a lista de **documentos básicos** pra deixar tudo pronto? (aprox. linha 8596)
- options:
  - (não identificado)
- fallback:
  - Conseguiu me confirmar certinho? 😊 | Você está **regularizando** a restrição ou ainda não? (aprox. linha 8620)
- interruptor: yes
- anchors:
  - case 'regularizacao_restricao' (aprox. linha 8495)

## envio_docs
- main:
  - [dinâmico] resposta.message... (step aprox. linha 8674)
  - [dinâmico] resposta.message... (step aprox. linha 8679)
  - [dinâmico] resposta.message... (step aprox. linha 8692)
  - Show! 👏 | A lista é bem simples, olha só: | 📄 **Documentos do titular:** | - RG ou CNH | - CPF (se não tiver na CNH) | - Comprovante de residência (atual) | - Comprovante de renda (de acordo com o perfil) | 📄 **Se somar renda com alguém:** | Mesmos documentos da outra pessoa 🙌 | Assim que tiver tudo em mãos, pode enviar por aqui mesmo. | Pode mandar uma foto de cada documento 😉 (aprox. linha 8717)
  - Sem problema 😊 | Fico no aguardo. Quando quiser, é só me chamar aqui! (aprox. linha 8750)
  - Perfeito! 👌 | Agora preciso ver sua documentação pra montar sua análise. | Quer que eu te envie a **lista dos documentos necessários**? (aprox. linha 8769)
  - Pode me enviar os documentos por aqui mesmo 😊 | Foto, PDF ou áudio que explique algo… tudo bem! (aprox. linha 8787)
- options:
  - (não identificado)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'envio_docs' (aprox. linha 8632)

## agendamento_visita
- main:
  - Perfeito! 👏 | Me diga qual **dia** e **horário** ficam melhor pra você ir até o plantão: | 📍 *Av. Paraná, 2474 – Boa Vista (em frente ao terminal)* (aprox. linha 8834)
  - Sem problema 😊 | Quando quiser agendar, me chama aqui rapidinho! | Eu garanto uma horinha boa pra você ser atendido(a) sem fila. (aprox. linha 8863)
  - Ótimo! 🙌 | Vou deixar registrado aqui: | 📅 *${userText.trim()}* | No dia, é só avisar seu nome na recepção que já te chamam 😉 | Qualquer coisa me chama aqui! (aprox. linha 8897)
- options:
  - Show! 👌 | Queremos te atender da melhor forma. | Você prefere **manhã**, **tarde** ou um **horário específico**? (aprox. linha 8922)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'agendamento_visita' (aprox. linha 8796)

## finalizacao_processo
- main:
  - (nenhum literal estático encontrado)
- options:
  - Perfeito! 👏 | Acabei de enviar seu processo ao correspondente bancário. | Assim que eles retornarem com a pré-análise, eu te aviso aqui mesmo 😊 (aprox. linha 9004)
  - Sem problema 😊 | Quando quiser que eu envie seu processo ao correspondente, é só me pedir aqui. (aprox. linha 9030)
  - Ótimo, fiz toda a conferência e está tudo certo com seus documentos ✨ | Quer que eu envie agora seu processo ao correspondente bancário para análise? (aprox. linha 9053)
- fallback:
  - (não identificado)
- interruptor: yes
- anchors:
  - case 'finalizacao_processo' (aprox. linha 8935)

## aguardando_retorno_correspondente
- main:
  - (nenhum literal estático encontrado)
- options:
  - Oi! Tudo bem? 😊 | Vamos começar do início rapidinho: | Você já sabe como funciona o Minha Casa Minha Vida ou prefere que eu explique? | Responde com *sim* (já sei) ou *não* (quero que explique). (aprox. linha 9104)
  - Estou acompanhando aqui 👀 | Assim que o correspondente retornar com a análise, te aviso! (aprox. linha 9171)
  - Recebi uma análise aqui, mas não tenho certeza se é do seu processo 🤔 | Pode confirmar pra mim o nome que está no retorno do correspondente? (aprox. linha 9195)
  - Ótima notícia! 🎉 | O correspondente bancário acabou de **aprovar** sua pré-análise! 🙌 | Agora sim podemos **confirmar seu agendamento** certinho. | Qual horário você prefere para a visita? Manhã, tarde ou horário específico? (aprox. linha 9223)
  - Recebi o retorno do correspondente… 😕 | Infelizmente **a análise não foi aprovada**. | Motivo informado: *${motivo.trim()}*. | Se quiser, posso te orientar o que fazer para **corrigir isso** e tentar novamente! 💙 (aprox. linha 9259)
  - Recebi uma mensagem do correspondente, mas preciso confirmar algo… | Pode me mandar novamente o trecho onde aparece o *status*? (aprox. linha 9283)
- fallback:
  - Opa, não consegui entender exatamente o que você quis dizer 🤔 | Pode me repetir de outro jeitinho, por favor? (aprox. linha 9297)
- interruptor: yes
- anchors:
  - case 'aguardando_retorno_correspondente' (aprox. linha 9068)
