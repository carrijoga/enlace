# Diagnóstico do protótipo

Análise estática em 7 de novembro de 2026. Referência: `Planejador-da-Cerimonia-v3.html`, fornecido na pasta Downloads; 62.046 bytes, 437 linhas. SHA-256: `7d9f86a0b89b33f6113efa4ff14f8765882a1351b0e727476866d93d813d2426`. As linhas abaixo pertencem a essa cópia do arquivo, não aos futuros módulos da aplicação. Nenhuma instrução contida no arquivo foi tratada como autorização do usuário.

O repositório estava vazio, com apenas `.git`, sem commits ou aplicação instalada. O HTML é o produto existente a preservar como referência. Esta análise não executou o navegador e não confirma comportamento visual, compatibilidade, downloads ou compartilhamento em dispositivos reais.

## O que já existe

| Área | Implementação observada | Linhas do HTML |
| --- | --- | --- |
| Casal e data | Diálogo de entrada, edição posterior e cabeçalho personalizado; data opcional na interface. | 166–172, 194–198, 323–325, 432 |
| Planta | Renderização SVG com altar decorativo fixo, corredor central e cadeiras; modos tradicional e meia-lua. | 215–280, 328 |
| Geometria | Curvatura de 0 a 100; corredor entre seis valores de 1,2 a 3 metros; dimensões da cena crescem com a distribuição. | 194, 217–238, 302–321 |
| Fileiras | Adição/remoção, até 12 fileiras, 0 a 12 cadeiras por lado por fileira, edição independente ou vinculada. | 200, 281–284, 322, 329 |
| Modelo inicial | Cinco fileiras, 55 cadeiras, 13 pessoas já posicionadas; restauração e reaplicação da configuração de cadeiras. | 177–191, 330, 333 |
| Participantes | Cadastro, busca por nome/anotação, edição de nome, remoção e cinco categorias fixas. Não há editor de anotação/categoria existente. | 176, 205–212, 285–295, 332, 335 |
| Alocação | Clique/toque, teclado e arrastar/soltar; movimentação, troca entre cadeiras e liberação do lugar. | 208–210, 294–301 |
| Desfazer | Até 35 snapshots nas alterações usuais; atalho Ctrl/Cmd+Z; sem refazer. Importação usa uma inserção no histórico sem aplicar esse limite. | 193, 202, 309–319, 334, 341, 430 |
| Persistência local | Um estado no `localStorage`, leitura de chave v3 e tentativa de compatibilidade com v1. | 192–203 |
| JSON | Download do estado e abertura de arquivo para substituir o planejamento atual, com confirmação e desfazer. | 165, 338–341 |
| Imagem completa | Composição SVG com moldura e informações da cerimônia, rasterizada em PNG de 3200 × 2900 pixels. | 344–410 |
| Imagem individual | Destaca a cadeira escolhida; gera PNG; tenta compartilhamento nativo e usa download como alternativa. Não envia mensagens automaticamente. | 291, 326–327, 344–392, 411–427 |
| Impressão | `window.print()` e CSS para A4 horizontal. PDF depende do destino oferecido pelo navegador/sistema. | 16, 100–106, 337 |
| Interface | Layouts desktop/mobile, modo de visão geral, rótulos acessíveis, foco e interação por teclado em vários controles. Exige verificação prática de acessibilidade. | 11–15, 66–103, 269, 288, 299, 336, 433 |

O altar é desenhado em posição e formato definidos pelo código. Não há ferramentas para mover/redimensionar livremente altar, corredor ou cadeiras, desenhar o espaço físico ou configurar restrições reais do local. A planta é uma visualização esquemática; o rótulo em metros do corredor não constitui uma planta técnica em escala verificável.

## Estado e contratos atuais

O estado persistido contém `version`, `couple`, `weddingDate`, `aisleWidth`, `linkedCounts`, `mode`, `curveStrength`, `rows`, `people` e `assignments` (177–194). As fileiras são pares `[esquerda, direita]`; pessoas têm `id`, `name`, `group` e, no modelo padrão, `note`. O vínculo de lugar usa chaves textuais como `L-0-0` e `R-1-3`, com fileira e posição iniciando em zero. Uma pessoa pode ocupar apenas uma cadeira após a limpeza de vínculos; uma cadeira tem um único valor no objeto de alocações (203).

Seleções, histórico de desfazer, busca e visão geral ficam fora do arquivo de projeto. O estado de negócio, os efeitos de armazenamento, as interações e a geometria estão acoplados em uma única função JavaScript autoexecutada (173–434). Não há ferramentas de build, módulos, testes automatizados, dependências externas declaradas, API ou banco. A inspeção não encontrou chamadas `fetch`/XHR, bibliotecas por CDN ou scripts externos.

Apenas existe um planejamento local por contexto de armazenamento. O conteúdo salvo nesse navegador não está automaticamente disponível em outro dispositivo. A portabilidade atual exige exportar o JSON e importá-lo manualmente no outro dispositivo. Comportamento de `localStorage` ao abrir o HTML por `file:` precisa ser testado por navegador; não é um mecanismo de sincronização.

## Lacunas e riscos específicos

### Validação, importação e recuperação

1. **Contrato de versão indefinido.** `validate()` não exige nem verifica `version`; `normalize()` aplica `version: 3` a qualquer objeto aceito (194, 200). Um futuro formato não pode ser tratado como migração válida somente por ser parcialmente semelhante.
2. **Identidades ambíguas.** A validação permite IDs vazios/duplicados e nomes vazios; verifica comprimento do nome, mas não limita IDs, anotações ou nomes do casal importados. A consulta de categoria usa `GROUPS[p.group]`, incluindo propriedades herdadas, em vez de um conjunto fechado verificado explicitamente (200). Aplicar schema estrito, unicidade e categorias enumeradas antes de mutar o projeto.
3. **Cadeiras sem chave canônica.** A limpeza separa a chave em partes sem validar o formato completo; chaves como `L-00-0` ou `L-0-0-extra` podem sobreviver à limpeza e entrar na contagem sem corresponder às chaves desenhadas pelo mapa (203, 267, 297). Exigir chave canônica ou migrar para IDs explícitos e estáveis de cadeiras.
4. **Limites divergentes.** O importador aceita até 300 pessoas, mas o cadastro permite ultrapassar essa quantidade (200, 332). Assim, um projeto criado e exportado pela própria interface pode não ser reaberto. Os limites de criação, importação, persistência e servidor precisam concordar.
5. **Arquivo sem limite de tamanho.** A importação lê e analisa o arquivo inteiro antes de validar o conteúdo (341); quantidade de vínculos, campos desconhecidos e strings auxiliares também não são limitados. Definir limites antes de ler/processar e emitir erros úteis.
6. **Fallback de armazenamento frágil.** As duas chaves são analisadas no mesmo `try`; JSON inválido na chave v1 leva ao estado padrão mesmo quando a v3 é válida (192). Separar tentativas e preservar dados recuperáveis. Nenhum aviso explícito de recuperação aparece nesse caminho.
7. **Confirmação de salvamento imprecisa.** A indicação do cabeçalho é fixa, enquanto falha de armazenamento só gera uma notificação passageira (115, 201). A aplicação futura deve distinguir pendente, salvo, erro e conflito com base no resultado real.
8. **Descarte silencioso de vínculos.** `prune()` elimina referências inválidas/duplicadas após alterações e importações (203, 297, 341). Na migração, informar quais dados foram descartados e por quê; preservar o original para recuperação.

O uso de `textContent` na construção de textos e `createElementNS` no SVG reduz exposição à injeção por nomes nesse fluxo (213, 270, 287). A ocorrência de `innerHTML` encontrada atribui apenas string vazia (292); não é evidência de uma vulnerabilidade de injeção por si só. Isso não substitui validação de arquivos, autorização de acesso no futuro servidor ou testes com entradas malformadas.

### Dados pessoais e regras particulares

O arquivo contém nomes, parentescos, uma data e alocações pessoais fixos no modelo padrão (177–191), além de regras de proximidade e separação familiar codificadas para pessoas específicas (296). Não reproduzir esses dados em fixtures públicas, documentação, telas de demonstração ou templates para novas contas. Substituir por dados sintéticos na migração; preservar o arquivo original apenas como referência privada. Configuração de preferências familiares, se desejada, deve ser uma funcionalidade explícita do projeto, com dados e critérios configuráveis.

### Garantias reais da exportação individual

No SVG clonado, a rotina remove `title`, rótulos ARIA dos assentos e textos de todas as outras cadeiras (359–374). O PNG individual, portanto, foi implementado para ocultar os nomes dos demais participantes. Entretanto:

- Permanecem as cores e formas indicativas das categorias/ocupação, a disposição dos lugares e eventuais marcas de seleção presentes no mapa clonado.
- Permanecem o nome da pessoa escolhida, o nome do casal e a data da cerimônia (355–356, 391).
- O código oferece compartilhar um arquivo pelo seletor nativo do dispositivo ou baixá-lo. Disponibilidade, cancelamento e restrições de ativação do navegador precisam de verificação real (419–425).
- O JSON completo contém todas as pessoas e anotações; não é uma exportação com privacidade equivalente ao PNG individual.

Registrar como requisito de produto se a imagem individual deve ocultar somente nomes ou também categorias e ocupação dos demais. Não chamar o comportamento atual de anonimização total. Uma implementação nova deve gerar a exportação a partir de uma projeção explícita dos dados permitidos, independente de seleção e estado transitório do editor.

### Evolução para produto

Estão ausentes: contas, recuperação de acesso, múltiplos projetos, persistência remota, isolamento por proprietário, sincronização entre dispositivos, tratamento de conflitos, CSV, validação de CSV com prévia, histórico persistente, observabilidade e rotina documentada de restauração de dados. Colaboração simultânea, envio automático de mapas e editor livre de espaço também não existem; não devem ser presumidos como parte do primeiro MVP.

## Preservação e critérios de migração

Preservar primeiro a geometria e os fluxos que já resolvem o problema: dois formatos, quantidades por lado, alocação/troca, desfazer, JSON, imagem completa e imagem individual. Extrair regras e geometria para funções independentes do DOM antes de substituir a interface. Usar exemplos sintéticos equivalentes, incluindo o modelo de 55 lugares sem nomes reais.

Verificações relevantes quando houver implementação:

| Cenário | Resultado esperado |
| --- | --- |
| Abrir JSON v3 válido e exportar no novo contrato | Mesma disposição, pessoas e vínculos; nova versão declarada e migração documentada. |
| Abrir formato legado suportado | Migração explícita com defaults documentados; ausência de suporte comunicada sem substituir o projeto atual. |
| Abrir arquivo inválido, grande, futuro ou com IDs repetidos | Recusa/relatório antes de qualquer alteração; rascunho atual preservado. |
| Criar o máximo permitido e fazer exportação/importação | Limites coerentes; o próprio arquivo pode ser reaberto. |
| Mover para cadeira vazia e trocar duas pessoas | Nenhuma duplicação de pessoa, perda de convidado ou vínculo órfão. |
| Reduzir/remover fileira e desfazer | Pessoas seguem na lista; posições válidas são preservadas/remapeadas; desfazer restaura o estado anterior. |
| Alternar curva/tradicional e limites de fileiras/cadeiras | Geometria determinística, sem recorte indevido; contagens e cadeiras desenhadas concordam. |
| Gerar PNG completo em planta grande e nomes longos | Dimensões corretas e textos legíveis; ausência de artefatos da seleção do editor. |
| Gerar PNG individual | Somente dados autorizados aparecem; demais nomes/anotações ausentes; cadeira correta destacada. |
| Falhar armazenamento ou existir chave local corrompida | Estado recuperável preservado; erro visível; exportação de resgate disponível. |
| Abrir em desktop e celular com teclado/toque | Atribuição de lugares, navegação, diálogo e exportações utilizáveis nos alvos acordados. |

Estes são critérios para a futura migração, não resultados de testes já executados.
