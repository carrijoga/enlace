# Roadmap de implementação

Atualizado em 08/11/2026, com frontend Vercel e backend/PostgreSQL Railway. Fases 0 e 1 concluídas no escopo local. Fase 2 entregue funcionalmente, com aceite de desempenho e aparelhos reais ainda pendentes. Etapas posteriores são propostas, não funcionalidades entregues.

## Fase 0 — Diagnóstico e estrutura documental — concluída

- Inspecionar repositório e HTML; distinguir código existente de desejos futuros.
- Preservar fonte local sem publicar os dados pessoais do exemplo.
- Registrar produto, proposta de arquitetura, modelo de dados, decisões, regras de agents e memória.
- Definir etapas e validações para migrar sem perder o trabalho já realizado.
- Incorporar a decisão Railway/PostgreSQL, substituir a proposta inicial de framework e definir metas de rapidez, leveza e uso simples.

Aceite: documentos coerentes, referências locais válidas, cópia idêntica à fonte e próximo passo registrado. O diagnóstico é estático: interação visual do HTML ainda não foi verificada.

## Fase 1 — Base executável e contratos — concluída localmente

Entregue: workspace pnpm, SvelteKit/Vercel, API Hono/Node, Drizzle/pg, contratos Zod/JSON v1 e migração v3, exemplo fictício, tipos/lint/formatação/testes/build, CI, Compose PostgreSQL local e documentação de operação. Node 24 e versões compatíveis registradas no lockfile. Direção atual no ADR-0003.

Aceite local: página/API/proxy responderam, exemplo e download foram verificados no navegador; 25 testes passaram, sem erros de tipos/lint. JavaScript inicial da tela base: 36,80 KiB gzip. Veja [validação](validacao-fase1.md). O pacote Vercel completo aguarda Linux/CI (symlinks bloqueados no Windows); o banco real aguarda daemon Docker/infraestrutura. Better Auth e migrações de negócio pertencem à fase 3, sem stubs que finjam esses recursos.

## Fase 2 — Migrar o editor local — funcional, em validação

Entregue: domínio testável, editor `/editor`, landing `/`, formatos/curvatura/corredor/fileiras, convidados/busca/categorias, atribuição/troca, desfazer/refazer, rascunho local protegido, JSON novo/v3, PNG geral/individual e impressão. Exemplos são fictícios e não incluem regras familiares pessoais. [Relatório](validacao-fase2.md).

Atualização 08/11/2026: perfil do cenário máximo feito e benchmark ampliado (`scripts/bench-editor.js`) para formato, seleção de cadeira/pessoa, troca, filtro e busca. Após as otimizações (ADR-0005, SVG em pixels, lista com `content-visibility`), todas as ações ficaram com p95 ≤ 50 ms no desktop, medidas sem pintura. Pendências para fechar todo o aceite: repetir a medição com pintura (painel visível) e verificar em celular físico. Não declarar a fase totalmente encerrada antes disso. Em seguida, fase 3: contas e persistência entre dispositivos.

Aceite:

- Tradicional/meia-lua, corredor, fileiras e quantidades preservam a planta esperada.
- Mover/trocar lugares nunca duplica ocupantes; remover fileira mantém convidados sem lugar.
- Rascunho local, desfazer, nomes/data, busca, JSON legado e PNG completo/individual funcionam.
- Estados temporários de seleção e histórico não entram no arquivo persistido.
- Uma verificação visual em desktop e celular e um fluxo por teclado confirmam o uso básico; limitações são registradas.
- Medir a rota do editor e as ações locais nos conjuntos sintéticos; CSV/PNG ficam fora do carregamento inicial e mover/selecionar não depende de resposta da rede. Resultados e desvios das metas são registrados.

Trabalho paralelo possível após os contratos: domínio/geometria; interface/editor; importadores/exportadores. Cada agent fica com arquivos exclusivos; alterações em contratos são integradas pelo coordenador.

## Fase 3 — Contas e persistência na nuvem

Completar a preparação PostgreSQL com banco real, schema/migrações Drizzle versionadas, Better Auth, autorização por proprietário na API e operações transacionais. Implementar transporte frontend→API de autenticação/projetos e conectar o editor ao salvamento com revisão esperada e recuperação de falhas. Validar cookies/origem entre Vercel e Railway. Não provisionar/publicar como efeito colateral.

Aceite:

- Cadastro/login/logout/recuperação de acesso e sessão expirada têm fluxos verificáveis.
- Salvar e reabrir em outro dispositivo preserva convidados, planta e atribuições.
- Testes com duas contas bloqueiam leitura/escrita/exclusão cruzadas, inclusive chamadas diretas.
- Metadados, convidados, planta e atribuições mudam numa transação e numa única revisão.
- Dois dispositivos editando a mesma revisão geram conflito visível sem sobrescrita silenciosa.
- Falha de rede e resposta fora de ordem não produzem “salvo” falso; rascunhos ficam isolados por conta/projeto.
- Excluir projeto segue a autorização e elimina dependências; logs não incluem lista de convidados nem credenciais.
- Role de runtime sem superuser/DDL, migrações com credencial própria e banco privado em produção; o navegador só chama o backend. Esquema/IDs de autenticação seguem a biblioteca, sem pressupor UUID de usuário.
- Recuperação/verificação de e-mail só são declaradas funcionais após transporte configurado e fluxo testado; sessões, origem e cookies são verificados no ambiente com proxy da Railway.

Trabalho paralelo possível depois do contrato de persistência: autenticação; schema SQL/transações/autorização; integração do editor. O conjunto só está pronto após teste integrado entre contas e dispositivos.

## Fase 4 — Importações e exportações do produto

Adicionar CSV com prévia, mapeamento de colunas, política de duplicidade e validação. Completar o round-trip JSON contra o novo modelo e refinar exportações gerais e individuais. Preservar recursos já migrados na fase 2.

Aceite:

- Arquivos CSV UTF-8 com vírgula ou ponto e vírgula, aspas, BOM, acentos e nomes iguais têm resultado definido e prévia correta; nada é gravado antes da confirmação da prévia.
- Erros por linha e limites de bytes/registros são visíveis; categorias desconhecidas e duplicatas não são resolvidas silenciosamente.
- JSON desconhecido, grande demais ou com referências inválidas não altera o estado; JSON suportado preserva os dados num ciclo exportar/importar.
- Importar como novo projeto cria nova identidade e propriedade da conta atual; IDs de proprietário do arquivo nunca concedem acesso.
- PNG geral não corta a planta; individual é gerado a partir da projeção permitida, sem textos/metadados dos demais convidados. Há alternativa de download quando compartilhar não está disponível.

## Fase 5 — Preparar a primeira versão utilizável

Revisar acessibilidade, responsividade, estados vazios/erros, limites e desempenho com conjuntos sintéticos. Definir ambientes, recuperação de dados, observabilidade sem dados pessoais, exclusão de conta e publicação.

Aceite: fluxo completo em ambiente de teste, migrações reproduzíveis, isolamento verificado, metas de desempenho aferidas e procedimento de backup/restauração ensaiado com dados fictícios. Vercel para frontend e Railway para API/PostgreSQL já estão escolhidos; validar o pacote completo, healthcheck e migrações pré-deploy. Domínio, região, recursos, orçamento e qualquer publicação são tratados quando houver uma versão concreta.

## Questões de produto para resolver no momento certo

| Questão | Padrão provisório | Quando resolver |
| --- | --- | --- |
| Uma ou duas contas do casal no mesmo projeto? | Um proprietário; colaboração futura sem compartilhar senha | Antes de implementar convites/acesso compartilhado |
| Mais de uma planta/cenário por projeto? | Uma planta por projeto; projetos independentes | Antes de oferecer cenários alternativos |
| Altas quantidades, dimensões reais e objetos livres? | Preservar limites e geometria atuais até validar | Contratos da fase 1 e descoberta do editor |
| CSV: colunas, duplicatas e tamanho? | Nome obrigatório e categoria opcional; prévia sem merge automático por nome | Antes da fase 4 |
| Regras de proximidade e separação familiar? | Remover regras pessoais fixas; regras configuráveis posteriores | Fase 2; descoberta antes de expandir |
| Região, recursos e custos? | Railway + PostgreSQL definidos; dimensionamento e orçamento pendentes | Antes de provisionar ambiente remoto/publicar |
| Como garantir leveza? | SvelteKit, poucas dependências e metas em `docs/desempenho.md` | Medir a base na fase 1 e o editor desde a fase 2 |

## Critério de conclusão de qualquer etapa

Código e documentação concordam; validações pertinentes são registradas; decisões têm status; `MEMORY.md` aponta o próximo trabalho real; nenhum agent fica com responsabilidade ambígua ao concluir a integração.
