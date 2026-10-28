import type { SqlDatabase } from "./database.ts";
import { nowIso } from "./database.ts";

const demoUsers = [
  ["user-ana", "ana.souza@nexo.com.br", "Ana Souza", "Financeiro", "employee"],
  ["user-carla", "carla.mendes@nexo.com.br", "Carla Mendes", "Operações", "employee"],
  ["user-bruno", "bruno.tavares@nexo.com.br", "Bruno Tavares", "Comercial", "employee"],
  ["user-diego", "diego.ramos@nexo.com.br", "Diego Ramos", "Produto", "employee"],
  ["user-elisa", "elisa.prado@nexo.com.br", "Elisa Prado", "Jurídico", "employee"],
  ["user-fabio", "fabio.nunes@nexo.com.br", "Fábio Nunes", "Engenharia", "employee"],
  ["user-gabriela", "gabriela.rocha@nexo.com.br", "Gabriela Rocha", "Marketing", "employee"],
  ["analyst-rafael", "rafael.lima@nexo.com.br", "Rafael Lima", "Suporte N2", "analyst"],
  ["analyst-marina", "marina.costa@nexo.com.br", "Marina Costa", "Suporte N1", "analyst"],
] as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function seedDemoData(db: SqlDatabase): Promise<void> {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users(id, email, name, department, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [id, email, name, department, role] of demoUsers) {
    await insertUser.run(id, email, name, department, role, nowIso());
  }

  const articles = [
    ["faq-vpn-809", "VPN com erro 809", "No Windows 10, reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. No Windows 11, este artigo não se aplica: abra um chamado para diagnóstico.", "Rede e VPN", ["vpn", "erro 809", "809", "windows 10", "windows 11"]],
    ["faq-hours", "Horário do service desk", "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.", "Outros", ["horário", "atendimento", "plantão", "service desk"]],
    ["faq-password", "Redefinir senha da rede", "Acesse o portal de identidade da Nexo, escolha ‘Esqueci minha senha’ e confirme sua identidade pelo aplicativo corporativo. A equipe de suporte nunca pede sua senha.", "Acesso", ["senha", "redefinir", "rede", "login"]],
    ["faq-mfa", "Configurar autenticação em duas etapas", "No portal de identidade, abra Segurança > Verificação em duas etapas e siga o assistente para registrar o aplicativo autenticador corporativo.", "Acesso", ["mfa", "autenticação", "duas etapas", "aplicativo"]],
    ["faq-sharepoint", "Acesso a pastas do SharePoint", "Peça acesso pelo catálogo de serviços, informando o nome da pasta e o nível necessário. A aprovação do gestor da área é exigida.", "Acesso", ["sharepoint", "pasta", "acesso", "financeiro"]],
    ["faq-sap", "Desbloquear usuário do SAP", "Solicite o desbloqueio pelo portal de identidade. Se o bloqueio persistir após redefinir a senha, abra um chamado na categoria Acesso.", "Acesso", ["sap", "bloqueada", "desbloquear", "senha"]],
    ["faq-monitor", "Solicitar monitor para home office", "Use o catálogo de equipamentos e selecione ‘Monitor adicional’. A solicitação precisa da aprovação do gestor e será acompanhada por um chamado REQ.", "Hardware", ["monitor", "equipamento", "home office", "tela"]],
    ["faq-outlook", "Outlook não sincroniza", "Verifique se o Outlook está conectado e reinicie o aplicativo. Se o problema continuar, inclua a versão do sistema e o horário da última sincronização em um chamado.", "E-mail", ["outlook", "email", "e-mail", "sincroniza"]],
  ] as const;
  const insertArticle = db.prepare(`
    INSERT OR IGNORE INTO knowledge_articles(id, title, content, category, keywords_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [id, title, content, category, keywords] of articles) {
    await insertArticle.run(id, title, content, category, JSON.stringify(keywords), nowIso());
  }

  const samples = [
    { number: "INC-20311", ownerId: "user-ana", title: "Notebook lento após atualização do Windows", description: "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.", type: "INC", category: "Hardware", priority: "Média", status: "Aguardando analista", scope: "Só você", age: 10, slaAge: 5, updateAge: 5, group: "Suporte N1" },
    { number: "INC-20298", ownerId: "user-ana", title: "Acesso à pasta Financeiro no SharePoint", description: "Preciso acessar a pasta Financeiro do SharePoint para fechar o relatório mensal.", type: "INC", category: "Acesso", priority: "Média", status: "Em andamento", scope: "Só você", age: 2, slaAge: 1, group: "Suporte N1" },
    { number: "REQ-10442", ownerId: "user-ana", title: "Segundo monitor para home office", description: "Solicito um segundo monitor para trabalhar de casa.", type: "REQ", category: "Hardware", priority: "Baixa", status: "Aprovado", scope: "Só você", age: 8, slaAge: 8, group: "Suporte N1" },
    { number: "INC-20150", ownerId: "user-ana", title: "Senha do SAP bloqueada", description: "Usuário do SAP bloqueado após tentativas de login.", type: "INC", category: "Acesso", priority: "Média", status: "Resolvido", scope: "Só você", age: 4, slaAge: 4, group: "Suporte N1" },
    { number: "INC-20519", ownerId: "user-elisa", title: "Erro ao abrir o sistema jurídico", description: "O sistema fecha ao abrir um processo salvo.", type: "INC", category: "Software", priority: "Alta", status: "Em andamento", scope: "Só você", age: 1, slaAge: 0, group: "Suporte N2" },
    { number: "INC-19877", ownerId: "user-ana", title: "Outlook não sincroniza no celular", description: "E-mails novos não aparecem no aplicativo do celular.", type: "INC", category: "E-mail", priority: "Baixa", status: "Resolvido", scope: "Só você", age: 30, slaAge: 30, group: "Suporte N1" },
    { number: "REQ-10919", ownerId: "user-carla", title: "Acesso ao ambiente de homologação", description: "Solicito acesso de leitura ao ambiente de homologação.", type: "REQ", category: "Acesso", priority: "Baixa", status: "Aguardando aprovação", scope: "Só você", age: 1, slaAge: 1, group: "Suporte N1" },
    { number: "INC-20460", ownerId: "user-bruno", title: "Wi-Fi indisponível no escritório", description: "Equipe comercial sem conexão Wi-Fi no andar 4.", type: "INC", category: "Rede e VPN", priority: "Crítica", status: "Em andamento", scope: "Minha equipe", age: 0, slaAge: 0, group: "Suporte N2" },
  ] as const;
  const insertTicket = db.prepare(`
    INSERT OR IGNORE INTO tickets(id, number, owner_id, title, description, type, category, priority,
      status, affected_scope, assigned_group, created_at, updated_at, sla_due_at, last_update_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of samples) {
    const createdAt = daysAgo(item.age);
    const updatedAt = item.status === "Resolvido" ? createdAt : daysAgo("updateAge" in item ? item.updateAge : Math.min(item.age, 2));
    const dueAt = daysAgo(item.slaAge);
    await insertTicket.run(
      `ticket-${item.number.toLowerCase()}`,
      item.number,
      item.ownerId,
      item.title,
      item.description,
      item.type,
      item.category,
      item.priority,
      item.status,
      item.scope,
      item.group,
      createdAt,
      updatedAt,
      dueAt,
      item.status === "Resolvido" ? "Chamado resolvido." : "Aguardando atualização do service desk.",
    );
  }

  const conversationId = "conversation-ana-overdue";
  const conversationTime = nowIso();
  const overdueTicket = await db.prepare("SELECT * FROM tickets WHERE number = 'INC-20311'").get() as Record<string, unknown>;
  const handoffSummary = "Solicitante: Ana Souza (Financeiro).\nChamado relacionado: INC-20311 · Notebook lento após atualização do Windows · Média.\nMotivo: Chamado sem atualização acima do prazo e pedido de atendimento humano.";
  await db.prepare(`
    INSERT OR IGNORE INTO conversations(id, user_id, state, active_ticket_id, handoff_reason, handoff_summary, created_at, updated_at, session_message_count)
    VALUES (?, 'user-ana', 'waiting', ?, ?, ?, ?, ?, 7)
  `).run(conversationId, String(overdueTicket.id), "Chamado sem atualização acima do prazo e pedido de atendimento humano.", handoffSummary, daysAgo(0), conversationTime);

  const messageRows = [
    ["seed-msg-ana-1", "user-ana", "employee", "Qual o status do meu chamado?", null, null],
    ["seed-msg-ana-2", null, "assistant", "Você tem 3 chamados abertos. Sobre qual deles quer saber?", JSON.stringify({ intent: "consulta", action: "listou_chamados", confidence: 0.96, reason: "Os chamados foram filtrados pelo funcionário autenticado.", tool: "consultar_meus_chamados", outcome: "success" }), null],
    ["seed-msg-ana-3", "user-ana", "employee", "INC-20311 · Notebook lento após atualização", null, null],
    ["seed-msg-ana-4", null, "assistant", "INC-20311 está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?", JSON.stringify({ intent: "consulta", action: "consultou_chamado", confidence: 0.95, reason: "Chamado próprio encontrado e prazo verificado.", tool: "consultar_chamado", outcome: "success" }), JSON.stringify({ ticket: { id: String(overdueTicket.id), number: "INC-20311", ownerId: "user-ana", title: "Notebook lento após atualização do Windows", description: "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.", type: "INC", category: "Hardware", priority: "Média", status: "Aguardando analista", affectedScope: "Só você", assignedGroup: "Suporte N1", createdAt: String(overdueTicket.created_at), updatedAt: String(overdueTicket.updated_at), slaDueAt: String(overdueTicket.sla_due_at), lastUpdateSummary: "Aguardando atualização do service desk." } })],
    ["seed-msg-ana-5", "user-ana", "employee", "Está parado há 5 dias.", null, null],
    ["seed-msg-ana-6", "user-ana", "employee", "Quero falar com um analista.", null, null],
    ["seed-msg-ana-7", null, "assistant", "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.", JSON.stringify({ intent: "escalonamento", action: "transferiu_para_analista", confidence: 0.99, reason: "O funcionário pediu atendimento humano.", tool: "transferir_conversa", outcome: "success" }), null],
  ] as const;
  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages(id, conversation_id, sender_id, sender_role, body, actions_json, decision_json, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)
  `);
  for (const [index, row] of messageRows.entries()) {
    await insertMessage.run(
      row[0], conversationId, row[1], row[2], row[3], row[4], row[5], new Date(Date.now() - (7 - index) * 60_000).toISOString(),
    );
  }
  await db.prepare(`
    INSERT OR IGNORE INTO conversation_events(id, conversation_id, actor_id, event_type, details_json, created_at)
    VALUES ('seed-event-ana-handoff', ?, 'user-ana', 'transferred', '{"reason":"Overdue ticket and user request"}', ?)
  `).run(conversationId, conversationTime);
}
