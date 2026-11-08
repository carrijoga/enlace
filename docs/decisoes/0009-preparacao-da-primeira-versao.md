# ADR-0009 — Preparação da primeira versão

Data: 08/11/2026. Status: aceita para implementação local da fase 5. Publicação e aceite hospedado pendentes.

## Contexto

Contas, editor e importações estão implementados localmente. A fase 5 reúne recuperação, acessibilidade, desempenho e operação; um build Windows não comprova a hospedagem Vercel/Railway.

## Decisões

- O usuário definiu Moto G84 como celular de referência nesta entrega. Navegador/versão e medições físicas ainda devem ser registrados. Mantém-se p95 de 50 ms; emulação não substitui o aparelho real.
- Logout explícito remove rascunhos e operações pendentes da conta neste navegador e notifica as outras abas. O rascunho anônimo e outras contas são preservados. Este comportamento já existia para os rascunhos; a fase 5 inclui importações pendentes na limpeza. Dados ainda não sincronizados devem ser exportados antes de sair.
- Importar JSON mantém a mesma identidade de projeto/operação após uma resposta ambígua. A tela oferece confirmação da operação pendente; não declara que nenhum projeto foi criado quando a resposta pode ter se perdido. Quando localStorage está indisponível, a retentativa sobrevive apenas na página aberta.
- Exclusão de conta exige sessão e senha atual no servidor; a UI confirma a consequência antes de enviar. Projetos e dependências são removidos por integridade referencial. Backups operacionais têm retenção separada, a definir antes da publicação.
- Observabilidade deve excluir nomes, e-mails, conteúdo de projeto, tokens e parâmetros de URL. Backup/restauração é verificado com dados fictícios em destino isolado; nunca ensaiar sobre o banco em uso.

- A alternativa à planta é uma lista recolhível, "Ver lugares em lista", no painel de convidados: fileira, lado, cadeira, ocupante e categoria, com a mesma seleção e atribuição da planta. O conteúdo só é montado ao abrir, para não pesar no cenário máximo. Ela também é o controle equivalente de WCAG 2.5.8 para as cadeiras pequenas no celular.
- O nome acessível da cadeira começa pelo nome completo da pessoa, seguido de fileira, lado, cadeira e categoria. A coordenada abreviada visível ("1 · 1") fica fora do nome de propósito, pois repetiria a informação. O axe aponta isso como `label-content-name-mismatch`; o alerta é aceito e deve ser reavaliado no teste com leitor de tela e comando de voz.

## Limites de aceite

Não provisionar nem publicar automaticamente. Antes da primeira publicação, definir região, orçamento, domínio, SMTP e retenção; testar HTTPS/origem/cookies, migrações com credencial separada, privilégios efetivos, restauração e o fluxo no Moto G84. Registrar resultados reais em `docs/validacao-fase5.md`.
