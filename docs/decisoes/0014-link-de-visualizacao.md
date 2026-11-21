# ADR-0014 — Link de visualização somente leitura

Status: proposta em 20/11/2026. As escolhas marcadas como "decisão do usuário" estão confirmadas. O resto é proposta técnica e pode mudar na implementação. Em 20/11/2026 foram implementados os contratos e a projeção `toSharedView` (etapa 1) e a tabela, o token e as rotas da API (etapa 2), ver [contratos](../contratos.md#link-de-visualização--fase-7-etapa-1). A página `/ver` e o painel "Compartilhar" ainda não existem. Na implementação, o título do projeto ficou fora da projeção até a questão aberta ser decidida.

## Contexto

Hoje só o dono abre o projeto, e só com a própria conta. O usuário quer que outras pessoas vejam a planta pelo celular ou pelo computador, sem conta no Enlace e sem poder editar: convidados procurando o próprio lugar, família, cerimonialista. A forma pedida é um link criado pelo dono.

`docs/modelo-de-dados.md` já previa "links de visualização com tokens limitados e revogáveis" como evolução. A colaboração com edição entre contas (`project_members`) é outro assunto e continua fora desta proposta.

## Decisões do usuário (20/11/2026)

1. **Link para quem não tem conta.** Abre em qualquer dispositivo, sem login, e não permite edição.
2. **Vários links com nome por projeto.** Por exemplo, "Família" e "Cerimonialista". Cada link é revogado sem afetar os outros.
3. **O dono escolhe o conteúdo de cada link.** São dois modos:
   - **Com nomes:** planta, nome de cada pessoa na cadeira, categorias e a busca "Encontre seu lugar".
   - **Só a planta:** cadeiras ocupadas e livres, sem nenhum dado de convidado.
4. **O dono escolhe a validade ao criar:** 7 dias, 30 dias, 90 dias ou sem prazo. Todo link pode ser desativado antes.
5. **Ordem:** entra antes da planta da festa (fase 6), depois do aceite hospedado da fase 5. Quando a festa existir, o link passa a mostrá-la (ver Consequências).

## Proposta

### Produto

- Só projetos salvos na conta podem ser compartilhados. O rascunho anônimo do navegador não tem link.
- No editor ou em `/projetos`, o botão "Compartilhar" abre um painel com os links do projeto: nome, modo, validade, data de criação e as ações "Copiar link", "Compartilhar…" (Web Share, quando o aparelho oferece) e "Desativar".
- Para criar um link, o dono informa o nome (1–60 caracteres), escolhe o modo e a validade. No modo "Com nomes", o painel avisa em texto simples que qualquer pessoa com o link verá os nomes dos convidados e que o link pode ser repassado.
- O link mostra a **última versão salva** do projeto, não um retrato do momento em que foi criado. Edições ainda não salvas e rascunhos não aparecem.
- Limite inicial: 10 links ativos por projeto. Links desativados ou vencidos saem da lista.
- Nome, modo e validade não mudam depois de criados. Para mudar, o dono cria outro link e desativa o antigo. Assim, quem recebeu um link "Só a planta" nunca passa a ver nomes.

### Página de visualização

- Rota própria `/ver`, pré-renderizada, sem o código do editor (sem arraste, desfazer ou salvamento). O link tem a forma `https://<domínio>/ver#<token>`.
- A página mostra casal, data, planta com zoom e deslocamento, legenda de categorias e a faixa "Somente visualização".
- No modo "Com nomes" há a busca "Encontre seu lugar": ao escolher um nome, a cadeira é destacada e centralizada. Também há a lista alternativa à planta ("Ver lugares em lista"), como no editor. O botão "Baixar meu mapa", que reaproveitaria o PNG individual, fica para depois da primeira entrega.
- No modo "Só a planta", a página mostra ocupação e totais, sem busca e sem lista de nomes.
- Link inválido, vencido ou desativado mostra a mesma mensagem: "Este link não está mais disponível. Peça um novo a quem enviou." A página não diz qual dos casos aconteceu.
- Para o convidado, o uso principal é no celular. A página precisa abrir rápido em rede móvel e cumprir a meta WCAG 2.2 AA do produto.

### Token e segurança

- **Token em fragmento (`#`).** O navegador não envia o fragmento ao servidor nem o põe no `Referer`. O token fica fora dos logs da Vercel e da Railway e de cabeçalhos para terceiros. O Vercel Analytics já descarta o fragmento (`sanitizeAnalyticsEvent`). A página lê o token e o envia no corpo de `POST /api/shared/view`, nunca na URL da API.
- **Formato:** `token = base64url(linkId ‖ HMAC-SHA256(SHARE_LINK_SECRET, linkId))`, com `linkId` UUID aleatório. O banco guarda só o `linkId`. Quem copia o banco não consegue montar links válidos sem o segredo do servidor, e o dono pode copiar o link de novo a qualquer momento, porque o servidor o recalcula. A verificação compara em tempo constante (`crypto.timingSafeEqual`, nativo do Node, sem nova dependência). Trocar o segredo invalida todos os links de uma vez e serve de botão de emergência.
- **Somente leitura no servidor.** O token só dá acesso a uma rota de leitura de projeção. Ele não vale como sessão, não chama `projectStore.save/delete` e não serve em nenhuma outra rota. As rotas de escrita continuam exigindo sessão, dono e origem. Esconder botões na interface não é o controle de acesso.
- **Projeção mínima.** Uma função pura `toSharedView(aggregate, mode)` monta a resposta com o casal, a data, a geometria da planta e:
  - "Com nomes": nome e categoria por cadeira;
  - "Só a planta": apenas cadeiras ocupadas, sem nomes.

  Nunca saem: notas, IDs de convidados, `owner_id`, revisão, recibos, nome/modo/validade dos outros links, nem convidados sem lugar (a pessoa só aparece onde está sentada). Testes verificam a ausência desses campos na resposta serializada, não só no tipo.
- **Validação no servidor a cada leitura:** link existe, `revoked_at` nulo, `expires_at` no futuro ou nulo, projeto existe. Excluir o projeto ou a conta remove os links em cascata.
- **Abuso:** limite de requisições em `/api/shared/view`. Com 256 bits de HMAC não há como adivinhar um token; o limite serve para conter custo. *Implementado de outra forma:* a API só vê o IP do proxy da Vercel, então o limite é por link e por instância (600 leituras por minuto, com folga para um grupo inteiro abrir o link ao mesmo tempo). Tokens forjados param no HMAC, sem consulta ao banco. Respostas com `Cache-Control: no-store`, `X-Robots-Tag: noindex` e `<meta name="robots" content="noindex">` na página. `Referrer-Policy: no-referrer` na página, por precaução.
- **Sem rastreio de quem vê.** Não registrar acessos por link, IP ou aparelho. Um contador agregado pode ser discutido depois, se fizer falta.

### Dados

Nova tabela, sem mudar o JSON do projeto nem a revisão:

| Tabela | Campos | Observações |
| --- | --- | --- |
| `project_share_links` | `id` (UUID), `project_id`, `label`, `mode` (`names` \| `plan`), `created_at`, `expires_at` (nulo = sem prazo), `revoked_at` | FK para `projects` com `ON DELETE CASCADE`; índice por `project_id`. O token não é guardado. |

- Criar e desativar links não altera `projects.revision` e não gera conflito com o editor, porque o link não é conteúdo do projeto.
- O limite de 10 links ativos é aplicado na mesma transação que insere o link, com o projeto bloqueado por `FOR UPDATE` e escopo pelo dono, para que duas criações simultâneas não passem do limite.
- O link não entra no JSON exportado, que já exclui permissões e URLs privadas. Importar um projeto não traz links.
- A leitura pública usa o mesmo agregado consistente da leitura do dono (`REPEATABLE READ` ou consulta única), filtrado pelo `project_id` do link.

### API

| Rota | Quem | Efeito |
| --- | --- | --- |
| `GET /api/projects/:id/share-links` | Dono (sessão) | Lista os links ativos, com o URL recalculado. |
| `POST /api/projects/:id/share-links` | Dono (sessão + origem) | Cria `{ label, mode, expiresInDays: 7 \| 30 \| 90 \| null }` e devolve o link. |
| `DELETE /api/projects/:id/share-links/:linkId` | Dono (sessão + origem) | Desativa (`revoked_at = now()`). Repetir a chamada não dá erro. O corpo é `{}`, porque o proxy exige JSON em métodos que alteram dados. |
| `POST /api/shared/view` | Público | Recebe `{ token }` e devolve a projeção ou `404 not_found` genérico. |

Todas as consultas de gerenciamento incluem o dono, como no restante da API. O link de outro projeto, ou de outro dono, responde 404. O allowlist do proxy (`apps/web/src/lib/server/api-proxy.ts`) recebe só essas rotas. O proxy continua sem repassar `Authorization`, porque o token vai no corpo. Os contratos de entrada e da projeção ficam em `packages/contracts`, com Zod estrito.

## Consequências

- **É a primeira rota pública com dados de projeto.** Passa a existir conteúdo do casal acessível sem conta. A proteção depende do segredo do token e do texto claro no momento de criar um link "Com nomes". Um link repassado não pode ser "desrepassado"; o controle possível é desativá-lo.
- Um novo segredo de ambiente, `SHARE_LINK_SECRET`, é obrigatório em produção, entra no runbook e nunca é comitado. Sem ele, a API recusa as rotas de compartilhamento.
- O bundle de `/ver` é separado do editor e reaproveita `PlanCanvas` e `SeatList` num modo somente leitura. O modo somente leitura precisa ser uma propriedade explícita desses componentes, não uma página com eventos desligados.
- **Festa:** quando a fase 6 existir, a projeção ganha o salão e, no modo "Com nomes", a mesa de cada pessoa. A regra muda nesse momento e precisa ser registrada: links já criados passam a mostrar a festa, e o modo "Só a planta" continua sem nomes.
- Não altera o contrato JSON, a migração v1/v3 nem o editor de outros donos. É uma entrega pequena perto da fase 6.

## Questões abertas

- Mostrar no link o título do projeto ou só casal e data.
- "Baixar meu mapa" a partir do link, reaproveitando a projeção individual do ADR-0010.
- Pré-visualização ao colar o link no WhatsApp: com o token no fragmento, a prévia é genérica do Enlace, sem casal nem data. Isso é proposital e protege a privacidade, mas pode ser reavaliado.
- Contador agregado de visualizações por link.
