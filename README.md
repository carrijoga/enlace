# Enlace

Planejamento visual de cerimônias de casamento: visualizar altar, corredor, fileiras e cadeiras e organizar onde cada participante vai se sentar.

## Estado atual

Base executável da fase 1, criada em 07/11/2026: frontend SvelteKit para Vercel, API Hono/Node para Railway e contratos JSON compartilhados. O protótipo HTML permanece como referência privada.

A tela inicial permite explorar um exemplo fictício, conferir JSON novo ou legado v3, baixar o novo formato e verificar a conexão com a API. A prévia mostra quantidades por fileira; o editor completo, as contas e o salvamento na nuvem continuam nas próximas etapas. Nenhum deploy foi realizado.

## Executar localmente

Pré-requisitos: Node.js 24.22.1 e pnpm 12.18.0, registrados em `.node-version` e `package.json`.

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

Abra [localhost:5173](http://localhost:5173). A API responde em [localhost:3001/health](http://localhost:3001/health). O comando conjunto compila/observa os contratos e inicia os dois apps. Para parar, use Ctrl+C. A tela e o healthcheck abrem sem PostgreSQL ou conta de infraestrutura.

```powershell
pnpm run check
pnpm run lint
pnpm run format:check
pnpm run test
pnpm run build
pnpm run measure:web
```

No Windows, `build` gera o build de produção para preview local. O pacote Vercel completo usa `pnpm run build:vercel` em Linux/CI, pois o adaptador exige links simbólicos bloqueados neste Windows. Veja [desenvolvimento e hospedagem](docs/desenvolvimento.md) para variáveis, PostgreSQL local e builds separados.

## Comece por aqui

| Documento | Conteúdo |
| --- | --- |
| [MEMORY.md](MEMORY.md) | Etapa atual, entregas, pendências e próximo passo |
| [PRODUCT.md](PRODUCT.md) | Objetivo, público e escopo inicial |
| [Diagnóstico](docs/diagnostico-prototipo.md) | O que o HTML realmente faz e suas limitações |
| [Arquitetura](docs/arquitetura.md) | Stack adotada para o bootstrap, módulos e fluxos cliente/servidor |
| [Modelo de dados](docs/modelo-de-dados.md) | Entidades, integridade, salvamento e arquivos |
| [Contratos executáveis](docs/contratos.md) | Formato JSON e compatibilidade com o v3 |
| [Desenvolvimento](docs/desenvolvimento.md) | Comandos, ambientes e preparação Vercel/Railway |
| [Validação da base](docs/validacao-fase1.md) | Evidências, medições e limites desta entrega |
| [Design](DESIGN.md) | Tokens e direção herdados do protótipo |
| [Desempenho](docs/desempenho.md) | Metas de leveza, resposta da edição e facilidade de uso |
| [Roadmap](docs/roadmap.md) | Ordem de implementação e critérios de aceite |
| [Decisões](docs/decisoes/README.md) | Decisões aceitas, propostas e questões abertas |
| [AGENTS.md](AGENTS.md) | Instruções permanentes para agents e trabalho paralelo |

## Protótipo de referência

A fonte recebida foi `C:\Users\gabri\Downloads\Planejador-da-Cerimonia-v3.html`. Uma cópia integral local é preservada em `prototypes/private/Planejador-da-Cerimonia-v3.html`, sem alteração do original. Essa pasta é ignorada pelo Git porque o modelo contém dados pessoais. Consulte [prototypes/README.md](prototypes/README.md).

Para abrir a referência local no Windows:

```powershell
Start-Process -FilePath '.\prototypes\private\Planejador-da-Cerimonia-v3.html'
```

O arquivo é independente e abre no navegador; o armazenamento pertence ao navegador/origem usado. Abrir a cópia em outro caminho não garante recuperar os dados do arquivo anterior: exporte um JSON no original e importe na cópia quando necessário. A cópia não acompanha clones do repositório e não é usada na demonstração nem nos testes.

## Direção técnica

Workspace pnpm com `apps/web` (SvelteKit/Vercel), `apps/api` (Hono/Node/Railway) e `packages/contracts` (TypeScript/Zod). Drizzle e `pg` integram a API; PostgreSQL será privado ao backend. Better Auth permanece recomendado para a etapa de contas, sem implementação ainda. Supabase foi descartado.

Importação/contratos são carregados sob demanda. A medição inicial da tela base está na validação; ainda não há benchmark do editor completo. Direção e tradeoffs na [arquitetura](docs/arquitetura.md) e no [ADR-0003](docs/decisoes/0003-frontend-vercel-api-railway.md).
