# Produto — Enlace

<!-- impeccable:product-schema 1 -->

Última atualização: 08/11/2026. Estado: definição baseada no pedido do usuário, com posicionamento, contexto de uso, voz e meta de acessibilidade confirmados em 08/11/2026; hipóteses adicionais estão identificadas abaixo.

## Platform

web

## Problema e público

O produto surgiu da necessidade de um casal visualizar a própria cerimônia: altar, corredor, formato das fileiras, quantidade de cadeiras e lugares dos participantes. O objetivo agora é transformar esse protótipo pessoal em uma aplicação com contas e projetos persistentes, acessíveis de diferentes dispositivos.

Público inicial: casais organizando a própria cerimônia. Uso por cerimonialistas, equipes e múltiplos clientes é uma possibilidade futura, ainda não um requisito confirmado.

## Resultado esperado

Uma pessoa entra na conta, cria um planejamento, configura a planta, cadastra ou importa convidados, distribui lugares e retorna depois em outro dispositivo com os dados salvos. Pode exportar o projeto para backup e produzir uma imagem geral ou um mapa individual para orientar um participante.

## Positioning

A planta é o produto. A cerimônia é desenhada como planta (altar, corredor, fileiras tradicionais ou em meia-lua) e cada pessoa ganha uma cadeira nela. Checklists, planilhas e sites de convite organizam listas; no Enlace, a lista de convidados existe para servir à planta.

## Operating Context

- O casal usa o editor no celular tanto quanto no computador. O fluxo completo (montar a planta, cadastrar pessoas e distribuir lugares) precisa ser igualmente bom nos dois; o celular não é só consulta.
- Dá para começar sem cadastro, com rascunho no navegador. A conta entra para salvar e reabrir o projeto em outro dispositivo.
- Materiais que fazem parte do uso: CSV de convidados, JSON de backup, PNG geral, PNG individual e impressão.
- Celular de referência: Moto G84 ([ADR-0009](docs/decisoes/0009-preparacao-da-primeira-versao.md)), ainda sem medição. O aparelho Android testado antes ficou com p95 de ~50–70 ms na maioria das ações, acima do orçamento de 50 ms, e está registrado como limite conhecido ([ADR-0006](docs/decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md)); a eventual otimização depende da medição no Moto G84.

## Requisitos explícitos

- Contas e acesso às informações em diferentes dispositivos.
- Persistência dos projetos fora do navegador.
- Importação de convidados em CSV.
- Exportação do projeto em JSON.
- Exportação de imagem completa e imagem individual.
- Preservação da finalidade central: planejar a disposição da cerimônia e seus participantes.
- Trabalho paralelo com subagents, decisões documentadas e memória atualizada.
- Frontend na Vercel; backend e PostgreSQL na Railway, sem Supabase.
- Produto rápido, leve e fácil de usar, com preferência por frameworks e dependências enxutos.
- A rota inicial `/` é a landing page; o planejador funciona separadamente em `/editor`.
- Editor leve, intuitivo, fácil de usar e bonito, com identidade visual própria coerente com o Enlace.

## MVP proposto

- Cadastro, entrada, saída e recuperação de acesso por e-mail; método exato confirmado na implementação.
- Lista de projetos da conta; criar, abrir, renomear e excluir com confirmação.
- Dados do casal e data; uma planta por projeto inicialmente.
- Formatos tradicional e meia-lua, curvatura, corredor, fileiras e quantidades por lado.
- Convidados com nome e categoria; busca, adição, edição e remoção.
- Posicionar, mover, trocar e retirar pessoas de cadeiras; desfazer ações locais.
- Salvamento automático com estados explícitos de pendência, confirmação, falha e conflito.
- Importação CSV com prévia e erros por linha; importação/exportação JSON versionado, incluindo migração do formato legado suportado.
- PNG completo e individual, impressão e uso por toque/teclado.
- Isolamento entre contas e preservação de rascunhos em falhas de rede.

O suporte a uma conta em vários dispositivos faz parte do MVP. Duas pessoas usando contas diferentes no mesmo projeto é uma hipótese de colaboração, a decidir separadamente; não pressupõe compartilhar senha.

## Limites iniciais

A planta é uma ferramenta de visualização e organização, sem garantia de escala arquitetônica ou dimensionamento físico. O altar já é desenhado no protótipo, mas posicionamento livre de objetos, medidas reais do local e edição do altar precisam de descoberta antes de entrar no escopo.

Não entram inicialmente: edição simultânea em tempo real, 3D, RSVP, convites enviados automaticamente, pagamentos, marketplace, gestão financeira e aplicação móvel nativa. O botão de compartilhar imagem não autoriza o sistema a enviar mensagens a convidados.

## Princípios de experiência

- A planta e a distribuição de lugares são a atividade principal; cadastro e ferramentas administrativas devem apoiar esse fluxo.
- Português do Brasil e funcionamento em desktop e celular.
- Usar texto simples e dados fictícios no modelo inicial. Regras familiares do protótipo não podem valer automaticamente para todos os projetos.
- Só dizer “salvo na nuvem” após confirmação do servidor.
- Mudanças que retiram lugares devem explicitar seu efeito; convidados não desaparecem quando perdem uma cadeira.
- Mapa individual não deve carregar nomes de outras pessoas; definir explicitamente se categorias e ocupação aparecem.
- Selecionar e mover pessoas deve ter resposta local imediata, sem aguardar o salvamento remoto. Importações, exportações e ferramentas secundárias carregam quando usadas.
- Manter o fluxo principal curto e controles claros em celular; medir leveza e tempo de resposta conforme [desempenho](docs/desempenho.md), sem presumir desempenho apenas pela escolha do framework.

## Brand Commitments

- Nome: Enlace, grafado em minúsculas na marca do cabeçalho.
- Voz: afeto na vitrine, clareza na ferramenta. A landing fala com calor ("Cada pessoa. Um lugar especial."); editor, conta e mensagens de erro usam linguagem simples e direta.
- A identidade visual está registrada em [DESIGN.md](DESIGN.md).

## Evidence on Hand

- O produto ainda não foi publicado. Não há clientes, depoimentos, imprensa ou números de uso, e nenhum deve ser inventado.
- Exemplos e testes usam dados fictícios. O HTML original em `prototypes/private/` contém dados pessoais e não serve como conteúdo ou fixture.
- Medições de desempenho e validações reais estão em `docs/desempenho.md` e `docs/validacao-fase*.md`, com seus limites.

## Accessibility & Inclusion

Meta: WCAG 2.2 AA em todas as telas (landing, conta, projetos, editor e diálogos), decidida em 08/11/2026. Inclui contraste, teclado, foco visível e alvos de toque, além de uma alternativa à planta visual para quem usa leitor de tela. A auditoria automatizada e a alternativa em lista foram feitas na fase 5 ([revisão](docs/revisao-ui-fase5.md)); sem teste com leitor de tela real, não declarar conformidade.

## Como avaliar a primeira versão

Um projeto criado em uma conta deve reabrir corretamente em outro dispositivo. A conta de outra pessoa não consegue acessá-lo por URL, API ou banco exposto. JSON exportado deve restaurar planta, convidados e lugares. Importação inválida não altera o projeto. Falha de rede ou escrita concorrente não pode apagar uma edição silenciosamente. Imagem individual mostra o lugar correto e só os dados autorizados para esse modo de exportação.
