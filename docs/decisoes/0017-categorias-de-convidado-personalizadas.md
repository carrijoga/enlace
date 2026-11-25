# ADR-0017 — Categorias de convidado personalizadas

Status: aceita e implementada localmente em 24/11/2026, a pedido do usuário ("ser possível adicionar outras categorias personalizadas além das padrões do projeto").

## Contexto

Até aqui a categoria do convidado era um enum fixo (`familia`, `padrinho`, `madrinha`, `pajem`, `convidado`), validado no contrato e num `CHECK` do PostgreSQL. As cores vinham de uma tabela fixa na interface.

## Decisões

1. **Por projeto, não por conta.** As categorias criadas ficam em `project.guestCategories`. Assim elas viajam com o JSON exportado, com a cópia (`clone`) e com quem edita por link, sem tabela nova nem regra de conta.
2. **Referência por UUID.** `guest.category` é uma das cinco chaves padrão ou o `id` de uma categoria do projeto. Renomear não toca nos convidados. O contrato recusa referência inexistente, ID repetido e nome repetido. A comparação de nomes ignora acento e caixa e inclui os nomes padrão.
3. **Cor de uma paleta fechada.** A categoria guarda só a chave (`rosa`, `azul`, `terracota`, `oliva`, `lavanda`, `mostarda`, `petroleo`, `cinza`). A interface define preenchimento, borda e texto com contraste. Não se aceita cor livre.
4. **Limites.** Até 20 categorias por projeto, nome de 1 a 30 caracteres, aparado.
5. **Excluir não apaga gente.** Quem estava na categoria passa para `convidado` e mantém cadeira e mesa. Com pessoas na categoria, o editor pede confirmação. Dá para desfazer.
6. **Compatibilidade.** O campo é opcional na entrada e vale `[]` quando ausente. JSON v2 antigo, v1 e legado v3 continuam válidos, sem mudar `schemaVersion`. O formato continua estrito para campos desconhecidos.
7. **Persistência.** Migração `0005_guest_categories`: coluna `projects.guest_categories jsonb NOT NULL DEFAULT '[]'`, com `CHECK` de array. O `CHECK` de `guests.category` passa a aceitar as chaves padrão ou um UUID. A integridade da referência é garantida pelo contrato, que a API aplica antes de gravar. A migração só acrescenta e é segura para dados existentes.
8. **Visualização pública.** No modo `names`, `/api/shared/view` leva só as categorias de quem tem cadeira (`guestCategories`), para legenda e cores. O modo `plan` continua sem dados de convidados.

## Consequências

- Importação CSV reconhece o nome de uma categoria do projeto e oferece as personalizadas no mapeamento.
- Planta, lista, legenda, mesas da festa, PNG e `/ver` resolvem cor e rótulo pela mesma função (`categoryLookup`).
- A página inicial importa só tipos dos contratos, para não carregar o Zod (JavaScript inicial de `/` continua em ~45 KiB gzip).
