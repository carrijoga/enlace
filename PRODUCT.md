# Produto — Enlace

Última atualização: 07/11/2026. Estado: definição inicial baseada no pedido do usuário; hipóteses adicionais estão identificadas abaixo.

## Problema e público

O produto surgiu da necessidade de um casal visualizar a própria cerimônia: altar, corredor, formato das fileiras, quantidade de cadeiras e lugares dos participantes. O objetivo agora é transformar esse protótipo pessoal em uma aplicação com contas e projetos persistentes, acessíveis de diferentes dispositivos.

Público inicial: casais organizando a própria cerimônia. Uso por cerimonialistas, equipes e múltiplos clientes é uma possibilidade futura, ainda não um requisito confirmado.

## Resultado esperado

Uma pessoa entra na conta, cria um planejamento, configura a planta, cadastra ou importa convidados, distribui lugares e retorna depois em outro dispositivo com os dados salvos. Pode exportar o projeto para backup e produzir uma imagem geral ou um mapa individual para orientar um participante.

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

## Como avaliar a primeira versão

Um projeto criado em uma conta deve reabrir corretamente em outro dispositivo. A conta de outra pessoa não consegue acessá-lo por URL, API ou banco exposto. JSON exportado deve restaurar planta, convidados e lugares. Importação inválida não altera o projeto. Falha de rede ou escrita concorrente não pode apagar uma edição silenciosamente. Imagem individual mostra o lugar correto e só os dados autorizados para esse modo de exportação.
