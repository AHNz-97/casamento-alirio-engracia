# Modelo de dados dos convites

## Entidades

### `invitations`

Representa o PDF e o link distribuído. Um convite pode ser individual, familiar ou coletivo.

- `public_token`: código aleatório usado no endereço público; não é sequencial.
- `recipient_name`: nome impresso no PDF.
- `contact_phone`: contacto usado pela administração para enviar o convite.
- `category`: classificação interna livre, como amigo, primo ou colega.
- `guest_of`: identifica internamente de quem é o convidado, como noivo, noiva, pais ou irmãos.
- `created_by`: email do administrador — noivo ou noiva — que criou o convite.
- `invitation_type`: `individual`, `family` ou `collective`.
- `guest_limit`: total máximo de pessoas abrangidas pelo convite.
- `status`: `sent`, `confirmed`, `absent` ou `inflation`. Inflação indica pedidos recusados por excesso à espera de revisão.
- `pdf_object_key`: localização privada do PDF no arquivo de ficheiros.
- `pdf_filename`, `pdf_generated_at` e `pdf_generated_by`: nome e auditoria da geração.
- `pdf_needs_update`: indica que nome ou limite foram alterados depois da última geração.

### `guest_origins`

Guarda as opções administráveis do campo “Convidado de”. O noivo ou a noiva podem acrescentar
novas designações na área privada sem alterar o código. Cada opção regista quem a criou e quando.

### `rsvps`

Representa uma pessoa ou uma confirmação familiar ligada a um convite.

- Convites individuais e familiares terão uma única confirmação.
- Convites coletivos poderão ter várias confirmações, até ao limite do convite.
- `phone_normalized` permite reconhecer uma pessoa que regressa pelo mesmo contacto.
- A combinação de convite e contacto normalizado é única.
- `guest_count` vale para a confirmação familiar; no modo coletivo cada pessoa ocupa normalmente um lugar.
- `decision_status` distingue uma presença confirmada, uma ausência voluntária e uma presença recusada por excesso.
- `requested_guest_count` conserva o número solicitado mesmo quando o sistema recusa a presença.
- `reviewed_by` e `reviewed_at` registam quem aprovou manualmente um pedido e quando.

O campo `invitation_id` permanece opcional apenas para compatibilidade com respostas antigas. As novas respostas exigem um link personalizado e ficam sempre associadas ao convite.

### `messages`

Cada mensagem pertence ao convite e, quando a presença foi registada, também à confirmação. Uma confirmação pode ter várias mensagens, todas inicialmente pendentes. A ligação direta ao convite permite guardar uma mensagem mesmo quando uma nova presença não cabe no limite.

- `moderation_status`: `pending`, `approved` ou `hidden`.
- `moderated_by` e `moderated_at`: administrador que tomou a última decisão e respetivo momento.
- `approved` permanece sincronizado para compatibilidade; apenas mensagens com estado `approved` aparecem publicamente.

## Regras aplicadas pela API

- Um convite individual ou familiar aceita apenas uma confirmação, mesmo que o contacto seja corrigido.
- Um convite coletivo aceita várias pessoas, mas não ultrapassa `guest_limit`.
- Uma nova mensagem do mesmo contacto não cria outra confirmação nem consome outro lugar.
- Uma ausência não impede o participante de enviar uma ou várias mensagens.
- Quando o limite for atingido, a mensagem e o pedido são guardados, mas a presença fica recusada.
- Noivo ou noiva podem aprovar manualmente uma presença recusada; a decisão e o momento ficam registados.
- Alterações feitas no formulário atualizam a confirmação, mas não substituem os dados administrativos do convite.
- Cada convite mantém um único PDF no arquivo privado. Uma atualização substitui o mesmo ficheiro, sem criar cópias sucessivas.
- A moderação usa o estado conhecido pelo administrador para impedir que duas decisões simultâneas se sobreponham silenciosamente.
