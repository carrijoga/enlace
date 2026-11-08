# Contratos executáveis

Status: implementados em `packages/contracts/src/index.ts`; testes de contrato em `packages/contracts/test/contracts.test.ts`. Este documento descreve o comportamento do pacote, não significa que a aplicação completa ou a persistência estejam prontas.

## Pacote e exports

Na fase 2, `@enlace/domain` consome estes contratos e oferece geometria, criação de projeto e comandos imutáveis para planta/convidados/atribuições. A interface nunca modifica arrays do projeto diretamente. Os contratos integram a entrada de `/editor`; somente exports de arquivos/imagens são carregados sob demanda. Persistência remota ainda não implementada.

O pacote `@enlace/contracts` exporta:

- `healthResponseSchema` e `readinessResponseSchema` para respostas de saúde da API;
- `ceremonyProjectSchema` para o agregado de domínio portátil;
- `projectDocumentSchema` para o envelope JSON atual;
- `CeremonyProject` e `ProjectDocument`, tipos inferidos dos schemas;
- `MAX_PROJECT_FILE_BYTES`, limite de 2 MiB;
- `parseProjectFile(text)`, parser e migrador puro;
- `createDemoDocument()`, documento fictício novo para demonstração.

O consumidor precisa compilar o pacote antes de importar o runtime de `dist/index.js` e os tipos de `dist/index.d.ts`. O comando conjunto de desenvolvimento observa o pacote para manter ambos atualizados.

## Envelope JSON portátil

O envelope atual tem formato estrito e rejeita propriedades desconhecidas:

```ts
{
  format: 'enlace-project',
  schemaVersion: 1,
  exportedAt: string, // data/hora ISO UTC, terminada em Z
  project: CeremonyProject
}
```

O projeto contém `title`, `couple.first`, `couple.second`, `weddingDate`, `layout`, `guests` e `assignments`. A data é `null` ou uma data ISO real `YYYY-MM-DD`. O layout contém `mode` (`curve` ou `straight`), `curveStrength` (inteiro de 0 a 100), `aisleWidth` (1.2, 1.5, 1.8, 2.1, 2.4 ou 3), `linkedCounts` e fileiras. Cada fileira tem UUID próprio e listas de UUIDs de cadeiras à esquerda e à direita.

Há de 1 a 12 fileiras e de 0 a 12 cadeiras por lado em cada fileira. O título tem de 1 a 120 caracteres e não pode conter somente espaços. Nomes do casal têm até 80 caracteres. Há no máximo 300 convidados; cada convidado tem UUID, nome de 1 a 100 caracteres (não apenas espaços), categoria entre `familia`, `padrinho`, `madrinha`, `pajem` e `convidado`, e nota de até 1000 caracteres. Atribuições ligam `seatId` a `guestId`.

Os schemas validam UUIDs, unicidade de IDs de fileiras, cadeiras e convidados, existência das referências e ocupação única por cadeira e por convidado. O envelope não inclui identidade de proprietário, autenticação, sessão, revisão remota, permissões ou estado de sincronização. Não inclui estado de interface nem histórico de desfazer.

## Leitura e migração

`parseProjectFile(text)` primeiro limita o tamanho em bytes UTF-8, analisa JSON e então valida o envelope atual ou migra o formato legado suportado. O retorno é um `ProjectDocument` validado. O parser não salva dados, não altera projeto em memória e não descarta atribuições inválidas silenciosamente. JSON malformado, campos desconhecidos no formato suportado, referências inválidas, versões não suportadas ou dados fora dos limites geram erro.

A compatibilidade legada cobre snapshots v3 com `version: 3`, `mode`, `rows`, `people` e `assignments` obrigatórios. Fileiras v3 são pares de contagens `[esquerda, direita]`; atribuições usam chaves canônicas `L-<fileira>-<índice>` e `R-<fileira>-<índice>`, com índices começando em zero. Grupos legados aceitos são exatamente `familia`, `padrinho`, `madrinha`, `pajem` e `convidado`. IDs antigos de pessoas precisam ser não vazios e únicos; toda atribuição deve apontar para pessoa e cadeira existentes, sem ocupação repetida.

Na migração, UUIDs novos são criados para cada fileira, cadeira e convidado, e as referências são remapeadas no mesmo processo. O import não preserva os IDs locais antigos como identidades permanentes. Campos legados opcionais ausentes usam defaults neutros: casal vazio, data `null` (incluindo `weddingDate: ""`), corredor de 1.8 m, curvatura 50 e contagens vinculadas. Título recebe `Meu projeto`; nota ausente fica vazia. Não se carregam defaults, nomes, convidados ou regras pessoais do protótipo.

Versões legadas diferentes de v3 e versões futuras do envelope são recusadas; a implementação não tenta reinterpretá-las como v1 ou v3. Um formato legado com propriedades extras também é recusado pelo schema v3 estrito.

## Exemplo de uso

```ts
import { createDemoDocument, parseProjectFile } from '@enlace/contracts';

const imported = parseProjectFile(await file.text()); // valida; ainda não salva
const demo = createDemoDocument(); // dados fictícios, sem participantes reais
```

`createDemoDocument()` cria metadados fictícios, planta tradicional com 55 cadeiras e lista de convidados vazia. Não deve ser confundido com dados de usuário ou com uma migração do estado pessoal do protótipo.

## Limite de responsabilidade

O mesmo pacote de schemas deve ser usado pela interface e pela API para evitar divergência de formato. A validação no navegador melhora o feedback, mas não é uma barreira de segurança: a API deve validar novamente entradas não confiáveis no servidor e aplicar sessão, autorização por proprietário, integridade transacional e controle de concorrência antes de persistir no PostgreSQL. Na implantação planejada, a interface fica na Vercel e a API com o PostgreSQL privado fica na Railway; o navegador não recebe acesso direto ao banco.

## Transporte autenticado — fase 3

O formato portátil JSON v1 permanece inalterado. O transporte remoto tem schemas estritos separados no mesmo pacote:

| Operação | Entrada | Resposta |
| --- | --- | --- |
| `GET /api/projects` | Sessão por cookie | `{ projects: [{ id, title, revision, updatedAt }] }` |
| `POST /api/projects` | `{ id, operationId, project }` | `{ id, revision, updatedAt, project }` |
| `GET /api/projects/:id` | Sessão por cookie | `{ id, revision, updatedAt, project }` |
| `PUT /api/projects/:id` | `{ expectedRevision, operationId, project }` | `{ id, revision, updatedAt }` |
| `DELETE /api/projects/:id` | `{ expectedRevision }` | `204` |

IDs de projeto/operação são UUIDs. Revisões são inteiros positivos seguros; timestamps são ISO UTC. Campos de proprietário são recusados: a API determina a identidade pela sessão. Erros usam `{ error: código }`: `unauthenticated` (401), `not_found` (404), `revision_conflict`/`operation_reused` (409) e `invalid_request` (400). Indisponibilidade não deve ser tratada como confirmação de salvamento.

Exports: `createProjectRequestSchema`, `saveProjectRequestSchema`, `deleteProjectRequestSchema`, `projectSummarySchema`, `projectSnapshotSchema`, `projectListResponseSchema`, `projectWriteResponseSchema` e os tipos correspondentes. A revisão remota não entra no arquivo exportado. O recibo de repetição de PUT confirma sua revisão original; o conteúdo atual exige GET separado. Ver [ADR-0007](decisoes/0007-contas-e-salvamento-transacional.md).
