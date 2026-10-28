# Checklist de requisitos do desafio

Fonte de requisitos: `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` (5 páginas). Os screenshots fornecidos foram tratados como referência visual; os requisitos funcionais e as regras de negócio abaixo vêm do PRD. As instruções do prompt anexado foram tratadas como escopo de trabalho, não como requisitos que substituem o PDF.

## Obrigatórios do PRD

| Verificação | Status | Evidência |
| --- | --- | --- |
| Usar Mastra (preferência) ou LangGraph.js como framework do agente. | Atendido | `src/server/agent/mastra-router.ts` implementa o roteador estruturado com Mastra. |
| Escolher um provedor/modelo LLM e justificar a escolha no README. | Atendido com configuração | OpenAI GPT-6.1 Sol selecionado e documentado; chamada real requer `OPENAI_API_KEY` e `NEXO_AGENT_MODE=mastra`. O modo local sem chave é apenas fallback de demonstração e não conta como uso do LLM. |
| Funcionário entra com conta de demonstração; perfil determina a área da aplicação. | Atendido | `src/app/api/auth/login/route.ts`, `src/server/auth/session.ts`, páginas `/chat` e `/console`. |
| Conversa salva e respeita o limite de 30 mensagens da sessão. | Atendido | `conversations.session_message_count`; `processUserMessage`; teste “session token…” e validação de workflow. |
| FAQ responde com artigo cadastrado e lida com artigo não aplicável. | Atendido | `knowledge_articles`, `searchKnowledge`, `handleFaq`; teste FAQ. Inclui VPN 809 Windows 10/11. |
| Consultar chamados sem exigir que o funcionário lembre o número. | Atendido | `listUserTickets` oferece seleção dos chamados próprios. |
| Exibir status, prioridade, atualização e prazo; permitir selecionar o chamado. | Atendido | Cartões e seleção em `TicketCard.tsx` e `ChatWorkspace.tsx`. |
| Complementar chamado com detalhe e confirmação antes da gravação. | Atendido | `beginUpdate`, `confirmDraft`; teste de update válido e de titularidade. |
| Reabrir chamado resolvido em até sete dias; negar após o prazo. | Atendido | Janela validada no serviço; testes dentro e fora de sete dias. |
| Evitar chamado duplicado relacionado que ainda esteja ativo. | Atendido | `findSimilarActiveTicket`; converte abertura em rascunho de complemento; teste de duplicidade. |
| Criar com tipo, título, descrição, categoria, prioridade e abrangência; confirmar antes de salvar. | Atendido | `TicketDraft`, classificação, coleta de abrangência e `confirmDraft`; testes de abertura/edição. |
| Regras de tipo INC/REQ e categorias definidas pelo PRD. | Atendido | `src/shared/types.ts` e `classification.ts`. |
| Prioridades e SLAs de 1 h, 4 h úteis, 3 dias úteis e 5 dias úteis. | Atendido | `sla.ts`, horário configurável em `APP_TIMEZONE`; teste de cálculo de SLA. |
| Escalonar quando a pessoa pede analista, caso crítico ou o agente não sabe decidir com segurança. | Atendido | `transferToHuman` e roteamento unknown/low confidence; teste de transferência e pausa. |
| Mostrar ao funcionário a razão da decisão e ações executadas. | Atendido | `DecisionTrace` persistida e detalhe expansível acima das respostas. |
| Console de analista com fila de transferências, assumir, responder, devolver e encerrar. | Atendido | `src/server/services/console.ts`, endpoints `/api/console/*`, `ConsoleWorkspace.tsx`; testes de API e serviço. |
| Transferência inclui resumo e pausa o agente até o analista devolver/encerrar. | Atendido | `handoffSummary`, estados `waiting`/`human`/`closed`, validação `AGENT_PAUSED`. |
| Persistir usuários, chamados, FAQ, conversas, mensagens e eventos. | Atendido | SQLite e migration `001_initial.sql`; teste fecha/reabre arquivo. |
| Seeds suficientes e repetíveis para demonstração. | Atendido | `seedDemoData` idempotente; oito artigos, nove perfis, chamados diversos e conversa na fila. |
| TypeScript estrito, documentação, `.env.example` e execução local simples. | Atendido | `tsconfig.json`, README, `.env.example`, scripts npm. |
| Interface de login, atendimento, perfil e consola próxima aos protótipos. | Atendido com validação HTTP | Telas React/CSS e teste HTTP de HTML e rotas. A inspeção visual em navegador não foi automatizada neste ambiente. |

## Diferenciais e avaliação

| Critério/diferencial | Status | Evidência |
| --- | --- | --- |
| Máscara clara entre roteamento do agente e regras de negócio. | Atendido | Classificador local ou Mastra seleciona intenção; serviços do backend validam e executam. |
| Aplicação publicada em ambiente externo. | Não incluído | O PRD marca deployment como diferencial; o projeto está preparado para GitHub, sem hospedagem configurada. |
| Qualidade visual e estados de carregamento, erro, ausência de dados e pausa. | Atendido no código | Telas e CSS incluem os estados; não foi feita captura visual com browser neste ambiente. |
| Casos principais e erros com teste automatizado. | Atendido | `tests/workflows.test.ts` e `tests/http-smoke.mjs`. |

## Decisões para ambiguidades

- **Serviço de tickets:** o PRD permite simular a integração externa. A operação correspondente é real dentro do escopo local e persiste em SQLite; não há chamada a um ITSM externo.
- **Senha:** o PRD pede senha arbitrária no demo. O login exige valor não vazio e identifica uma conta de seed; não autentica credenciais reais. Não é uma configuração de produção.
- **“Não sei” na abrangência:** o protótipo oferece essa escolha e o banco a registra. Como não há abrangência conhecida, a classificação aplica prioridade conservadora até haver mais evidência.
- **Prazo vencido:** o funcionário vê a explicação e uma ação para chamar analista. A transferência exige a escolha da pessoa, seguindo a pergunta e as opções do protótipo; a conversa não é transferida silenciosamente.
- **Feriados:** o PRD define dias/horas úteis, mas não lista feriados. O cálculo desconta fins de semana e horário fora de 8h–18h, sem calendário de feriados.
- **LLM:** Mastra com OpenAI GPT-6.1 Sol classifica intenções; o backend executa as operações e aplica autorização. A chave fica fora do Git. O modo local está disponível para demonstração sem credenciais, mas não substitui o requisito de usar um LLM na avaliação.
- **Redefinição de senha e privacidade:** não existe serviço de e-mail no escopo local. A tela informa a limitação e oferece o canal/ramal de demonstração.
