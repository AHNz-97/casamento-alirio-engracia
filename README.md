# Convite de casamento — Alírio & Engrácia

## Duas celebrações, um painel

`/inharrime` apresenta o convite de Inharrime (4 de outubro); `/xai-xai`
repõe o convite original de Xai-Xai (3 de outubro), incluindo confirmação de
presença e mensagens pelo link pessoal. `/admin` mantém a entrada de Alírio,
com navegação entre `/admin/inharrime` e `/admin/xai-xai` usando a mesma sessão.
Xai-Xai reutiliza os registos originais de `invitations`, `rsvps` e `messages`,
sem os misturar com as tabelas de Inharrime. As APIs recuperadas ficam sob
`/api/admin/xai-xai` e `/api/xai-xai`. Os links antigos `/i/:token` e `/?invite=...`
continuam válidos. Os novos links de Xai-Xai usam `/xai-xai?invite=...`.
O painel e a apresentação de mensagens de cada celebração continuam privados.
O HTML dos painéis é servido apenas pelo Worker autenticado, nunca como ficheiro estático.
Os testes de integração das duas celebrações usam o Worker compilado: compilar antes de testar alterações às rotas.

## Crachás da organização

O botão “Criar Crachás” no painel abre `/admin/crachas`, exclusivo de Alírio.
Nome e função são obrigatórios; a fotografia é opcional. Suporta cadastro individual, JSON, CSV/TSV/TXT
e tabelas Word (.docx), revisão antes de importar, edição e exclusão. Os dados ficam
nas tabelas `badge_batches`, `badges` e `badge_pdf_runs` (migração 0006).
As fotografias ficam em R2 privado, com metadados em `badge_photos` (migração 0008).
O formulário aceita fotos até 5 MB, converte para JPEG até 1000 px e permite voltar
ao símbolo dos noivos. Apenas Alírio pode carregar, consultar ou remover estas fotos.

A geração é manual e todos os registos começam seleccionados. Gera sempre os dois
modelos para a mesma lista. “Baixar PDF's” entrega um ZIP com os dois PDFs; se faltar
um modelo ou houver alterações, abre a selecção para gerar e baixar ambos. Os pedidos
têm um limite de dois minutos, incluindo a transferência, para permitir tentar novamente
quando a ligação fica presa. Horizontal: seis
por folha A4 deitada, com a imagem original reencaixada sem cortar as bordas.
Vertical: quatro por A4 ao alto, a partir do PDF fornecido. Ambos usam a fotografia
individual quando existe e o símbolo dos noivos quando não existe. Os espaços
restantes têm nome e função vazios. Nunca geram versos.
Cada modelo guarda a sua última geração em R2. Novos registos entram quando se
gera novamente; editar, trocar a foto ou apagar um registo incluído invalida o PDF anterior.
Os PDFs são privados e não incluem links públicos nem códigos QR.

## Convite actual: Inharrime (4 de outubro de 2026)

O painel `/admin` usa `inharrime-admin.html` e substitui a gestão do convite anterior.
Nome, número de convidados e uma das 11 categorias são obrigatórios. “Irmãos”
substitui “Primos”; a categoria 11 é “Convidados dos padrinhos”. A mesa e a cadeira
são atribuídas automaticamente; o contacto é opcional. A importação aceita JSON, CSV/TSV/TXT e tabelas Word `.docx`,
até 500 registos por lote, com revisão e validação integral antes da gravação.

Os novos registos ficam nas tabelas `inharrime_batches` e `inharrime_invitations`; os
dados antigos não são misturados nem apagados. Os pedidos repetidos usam uma chave de
idempotência e a gravação de cada lote é transaccional. A ordem de criação é estável.

O PDF original fica em `assets/documents/convite-inharrime.pdf`. Cada folha A4 tem 4
convites; cada folha gera 2 páginas (frente e verso). Para 6 convites são 4 páginas
com 2 espaços em modelo; para 9 são 6 páginas com 3 espaços em modelo. Os versos
espelham as colunas para impressão duplex pela margem longa, a 100%. Nome, quantidade
e código do lugar são personalizados. O QR é partilhado por toda a categoria e
abre `/mensagem/categoria/1` até `/mensagem/categoria/11`. A mesa também aparece na página personalizada;
categoria e contacto ficam apenas no painel.

O cadastro é separado da geração. “Ver base de dados” permite editar, apagar e
seleccionar convidados para “Gerar PDF”; todos começam seleccionados. Cada geração
guarda um PDF A4 em R2 e uma fotografia dos dados em `inharrime_pdf_runs`. Alterar ou
apagar um registo incluído torna essa geração desactualizada. Novos registos não
alteram automaticamente o PDF anterior. A ordem de criação mantém-se.

`/api/admin/inharrime/pdf` baixa a última geração válida; `?id=...` baixa o convite
digital de uma página no modelo antigo com fotografia do casal. O ícone do globo
contém um link para `/convite/TOKEN`, com o novo programa (chegada às 10h e copo de
água às 12h30), sem confirmação de presença. Só registos gerados têm PDFs disponíveis.

A página do convidado permite enviar texto e fotografia opcional. As imagens são
reduzidas e convertidas no navegador e guardadas em R2. As mensagens ficam em
`inharrime_messages`, pendentes de aprovação; `/mensagens` apresenta apenas aprovadas.

### Mesas, protocolo e mensagens por categoria

São 25 mesas, de 0A a 4E, com dez cadeiras 00–09 cada: 0A00 é mesa 1, cadeira 1.
O intervalo 0–4 é intencional: 0–5 daria 30 mesas. A atribuição reserva mesas por
categoria, preenche as cadeiras livres dessa categoria e só depois abre outra mesa.
Mesas vazias podem ser reutilizadas; nomes e contactos não são divulgados nas páginas
dos QR. Em grupos, cada pessoa tem um lugar; o primeiro código aparece no PDF e
permite encontrar todo o grupo no protocolo. Todos os códigos constam da página
personalizada e do painel. Alterações de categoria ou quantidade recalculam lugares
e invalidam o PDF; convites com pessoas presentes não podem mudar de lugares.

`/protocolo` aceita Alírio ou a conta limitada `protocolo`, com senha configurada em
`PROTOCOL_PASSWORD_SHA256`. Apenas lista nome, categoria, quantidade, códigos e
presenças; não permite ler mensagens, fotografias, contactos, gerir convites ou crachás.
Cada chegada tem hora do servidor, mostrada em Africa/Maputo; correcções deixam
histórico em `seating_events`. Versões e transacções impedem que um dispositivo
desactualizado substitua a marcação de outro. O cadastro mantém-se separado da
geração dos PDFs. A migração 0007 cria as estruturas e renomeia a categoria existente.
`POST /api/admin/inharrime/allocate` atribui lugares aos registos anteriores, sem
criar novos convidados ou marcar presença.

As novas mensagens ficam em `category_messages`, sem dependência de um convite
individual. A categoria é identificada pelo QR, sem selecção de categoria ou mesa; apenas o texto é obrigatório. Nome e foto são opcionais.
As interfaces usam nomes como “Mesa da família”, sem expor os prefixos internos das mesas. O código completo do convite continua disponível para pesquisa no protocolo. O formulário avisa, em letras pequenas e vermelhas, que o carregamento de fotografias pode demorar com internet lenta.
Sem nome, aparece o nome da mesa; sem fotografia, a apresentação usa um ícone provisório de
mesa em CSS, preparado para substituição pela imagem que o utilizador fornecer.
Só Alírio consulta, aprova e apresenta mensagens, incluindo mensagens anteriores.
Fotografias pendentes/ocultadas só podem ser abertas pelo administrador. A apresentação
usa toda a área para texto quando não existe foto. Apagar um convidado remove também
as suas mensagens e fotografias e desactiva o link.

O único administrador é `alirio`. O login usa `ADMIN_ALIRIO_PASSWORD_SHA256` e uma
sessão em D1 com cookie Secure, HttpOnly e SameSite=Strict. Não há login HTTP Basic nem
acesso alternativo por email. O cookie não tem prazo persistente; recarregar não termina
a sessão. O navegador pode restaurar cookies de sessão após reiniciar, pelo que não é
possível garantir a saída exactamente ao desligar o computador. “Sair” revoga a sessão.

Validação: `npm test` (Node 24), `npm run build`. O script `scripts/render-pdf.ps1`
permite inspecionar os PDFs em Windows. Os exemplos de teste ficam em `output/pdf/`
e não são publicados. O código do servidor é compilado para um Worker ESM.

## Documentação histórica do convite anterior

Primeira versão local do convite digital.

## Páginas

- `index.html`: convite responsivo e formulário de confirmação.
- `mensagens.html`: apresentação das mensagens aprovadas para TV ou projetor.
- `admin.html`: área privada para cadastrar, pesquisar e editar os convites.

## Estado atual

- Data: 3 de outubro de 2026, sábado, em Xai-Xai.
- Confirmação solicitada até 10 de setembro de 2026.
- O cronograma completo foi transcrito do PDF original.
- A lista de sugestões de presentes foi adaptada do convite de Abdul e Albertina.
- As opções de contribuição incluem M-Pesa, e-Mola, BIM e BCI, com botões para copiar os números.
- O formulário não envia dados quando o ficheiro é aberto diretamente no computador.
- Quando o site for alojado, as respostas serão guardadas numa base D1.
- As mensagens entram como não aprovadas e só aparecem no projetor depois da moderação.
- A base de dados distingue convites individuais, familiares e coletivos.
- Convites coletivos admitem várias confirmações; convites familiares usam uma única confirmação.

## Gestão de convidados

O modelo persistente está documentado em `db/DATA_MODEL.md`. A estrutura inclui convites com
token público, categoria, tipo e limite de pessoas, além de confirmações e várias mensagens por
participante. A migração inicial encontra-se em `db/migrations/0001_invitations.sql`.

A área administrativa permite filtrar por nome, contacto, categoria, tipo e estado. Na versão
online, tanto a página como `/api/admin/*` devem ser protegidos pelo Cloudflare Access. A API
valida o token assinado do Access e pode limitar os administradores através de `ADMIN_EMAILS`.
Os valores necessários estão indicados em `.dev.vars.example` e só serão configurados durante a
etapa de publicação.

Cada convite recebe um endereço no formato `/i/CODIGO`, que encaminha para o convite público e
preenche automaticamente os dados dos convites individuais ou familiares. No modo coletivo, cada
participante informa os próprios dados. Esse endereço é inserido automaticamente no PDF personalizado.

Os estados do convite são enviado, confirmado, ausente e inflação. Ausente significa que o
convidado marcou que não participará; inflação assinala pedidos recusados automaticamente por
excesso. Esses pedidos e as respetivas mensagens são guardados e podem ser aprovados pelo noivo ou
pela noiva. A aprovação regista o administrador, a data e a hora.

Cada convite guarda ainda o campo interno `convidado de`, o email do administrador que o criou e o
momento da criação. A administração online será limitada aos dois emails autorizados no Access.

As opções de `convidado de` são administradas na própria área privada. As opções iniciais podem ser
ampliadas a qualquer momento e cada nova opção também guarda autor, data e hora.

## PDFs personalizados

Na lista administrativa, cada convite tem uma área própria para gerar e baixar o PDF. O PDF inclui
o nome do destinatário, o número de pessoas e um link clicável no ícone do globo. Depois de gerado,
o ficheiro fica guardado num arquivo privado e o botão passa a baixar a mesma versão, evitando novas
gerações. Se o nome ou o limite forem editados, a administração assinala que o PDF está desatualizado;
ao atualizá-lo, o mesmo ficheiro é substituído.

Os metadados ficam na base D1 e o conteúdo do PDF fica no arquivo R2 ligado como `PDFS`. A migração
`db/migrations/0002_invitation_pdfs_and_guest_origins.sql` acrescenta os campos e a tabela necessários.

## Moderação e apresentação das mensagens

A administração lista as mensagens como pendentes, aprovadas ou ocultadas. Aprovar coloca a mensagem
no ecrã público; ocultar ou retirar do ecrã impede a sua apresentação. Cada decisão guarda o email do
administrador, a data e a hora, e há proteção contra decisões simultâneas dos dois administradores.

`mensagens.html` apresenta apenas mensagens aprovadas, atualiza a lista automaticamente e oferece
pausa, mensagem anterior, mensagem seguinte, atalhos de teclado e ecrã inteiro para TV ou projetor.
A API pública nunca devolve telefone, estado de presença ou outros dados internos. A migração
`db/migrations/0003_message_moderation.sql` acrescenta os estados e a auditoria.

## Fotografias

A galeria usa as quatro fotografias fornecidas para representar os momentos principais da história
do casal. Os ficheiros estão guardados em `assets/images/`.

## Música de fundo

O convite público usa “Romantic Pieces — III”, de Antonín Dvořák, numa gravação disponibilizada
sob dedicação [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) pela
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dvo%C5%99%C3%A1k_-_Romantic_Pieces_-_III.ogg).
O volume inicial é moderado, a reprodução começa após a primeira interação quando o navegador
bloqueia o início automático e o convidado pode pausar ou retomar a música a qualquer momento.

## Privacidade

O endpoint público de mensagens devolve apenas nome, mensagem e data de mensagens aprovadas.
Números de telefone e respostas de presença nunca são apresentados publicamente.
