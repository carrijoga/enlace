# ADR-0005 — Comandos do domínio com compartilhamento estrutural

Status: aceito. Data: 08/11/2026. Origem: perfil do cenário máximo da fase 2 (288 cadeiras/300 convidados).

## Contexto

Cada comando de `packages/domain` validava o resultado com `ceremonyProjectSchema.parse` e devolvia o objeto produzido pelo Zod. Esse parse cria uma cópia profunda: todos os convidados, fileiras e atribuições viravam objetos novos a cada edição. A interface Svelte compara por referência, então uma troca de formato ou de lugar fazia os 300 convidados da lista e as 288 cadeiras parecerem alterados, e o editor comparava projetos com dois `JSON.stringify` completos.

## Decisão

- Os comandos continuam validando o projeto inteiro com o contrato estrito, mas devolvem o próprio objeto montado pelo comando, não a cópia do Zod. Trechos não alterados mantêm a referência anterior (compartilhamento estrutural); trechos alterados são objetos novos, nunca mutação no lugar.
- Comando sem efeito pode devolver o mesmo objeto recebido (por exemplo, atribuir alguém à cadeira que já ocupa).
- Entrada externa (arquivo JSON, rascunho local, futura API) continua passando por parse completo nos contratos; esta decisão vale só para o resultado dos comandos de domínio, que já recebem um projeto válido.
- O editor detecta comandos sem efeito por comparação de referências/campos, não por serialização do projeto inteiro.

## Consequências

Testes de domínio garantem que convidados, fileiras e atribuições não alterados mantêm a referência e que resultados inválidos continuam rejeitados. Quem implementar novos comandos não deve mutar o projeto recebido nem reutilizar arrays alterados. A futura persistência (fase 3) pode aproveitar as referências para detectar o que mudou, mas a revisão no servidor continua sendo a fonte de verdade para conflitos. Medições em [validação da fase 2](../validacao-fase2.md).
