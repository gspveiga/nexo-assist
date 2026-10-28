import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "nexo-http-smoke-"));
const env = {
  ...process.env,
  NODE_ENV: "production",
  DB_PATH: join(scratch, "http-smoke.sqlite"),
  SESSION_SECRET: "http-smoke-secret-with-at-least-32-characters",
  NEXO_AGENT_MODE: "local",
  NEXT_TELEMETRY_DISABLED: "1",
};

const seeded = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/seed.ts"], {
  cwd: projectRoot,
  env,
  encoding: "utf8",
});
if (seeded.status !== 0) throw new Error(`Não foi possível preparar a base para o smoke test: ${seeded.stderr}`);

const portServer = createServer();
await new Promise((resolveListen, reject) => {
  portServer.once("error", reject);
  portServer.listen(0, "127.0.0.1", resolveListen);
});
const port = portServer.address().port;
await new Promise((resolveClose, reject) => portServer.close((error) => error ? reject(error) : resolveClose()));

const next = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", String(port)], {
  cwd: projectRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
next.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
next.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
const serverExit = new Promise((resolveExit) => next.once("exit", (code) => resolveExit(code)));
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (next.exitCode !== null) throw new Error(`O Next encerrou durante a inicialização (${next.exitCode}).\n${serverOutput}`);
    try {
      const response = await fetch(base, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* Retry while the production server binds its port. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`O Next não respondeu dentro do tempo limite.\n${serverOutput}`);
}

async function json(path, options = {}, cookie = "") {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, { ...options, headers });
  let body;
  try { body = await response.json(); } catch { body = await response.text(); }
  return { response, body };
}

async function login(email) {
  const { response, body } = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "demo" }),
  });
  assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(body)}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function postChat(cookie, conversationId, message) {
  return json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ conversationId, message }),
  }, cookie);
}

try {
  await waitForServer();

  const loginPage = await fetch(base);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Seu problema de TI, resolvido/);

  const employeeCookie = await login("ana.souza@nexo.com.br");
  const employeePage = await fetch(`${base}/chat`, { headers: { Cookie: employeeCookie } });
  assert.equal(employeePage.status, 200);
  assert.match(await employeePage.text(), /Atendimento/);
  const forbiddenConsole = await json("/api/console", {}, employeeCookie);
  assert.equal(forbiddenConsole.response.status, 403);

  const createdConversation = await json("/api/conversations", { method: "POST" }, employeeCookie);
  assert.equal(createdConversation.response.status, 201);
  const conversationId = createdConversation.body.conversation.id;

  const faq = await postChat(employeeCookie, conversationId, "Como redefino a senha da rede Nexo?");
  assert.equal(faq.response.status, 200);
  assert.equal(faq.body.messages.at(-1).decision.tool, "buscar_central_de_ajuda");
  assert.match(faq.body.messages.at(-1).body, /portal de identidade/i);

  const createDraft = await postChat(employeeCookie, conversationId, "Meu notebook não conecta na VPN e mostra erro 809 no Windows 11. Tenho reunião com cliente hoje.");
  assert.equal(createDraft.body.conversation.draft.operation, "create");
  const createdTicketResult = await postChat(employeeCookie, conversationId, "confirmar");
  const createdTicket = createdTicketResult.body.messages.at(-1).payload.ticket;
  assert.ok(createdTicket.number.startsWith("INC-"));
  const ticketList = await json("/api/tickets", {}, employeeCookie);
  assert.equal(ticketList.body.tickets.some((ticket) => ticket.number === createdTicket.number), true);

  const lookup = await postChat(employeeCookie, conversationId, "Qual o status do meu chamado?");
  assert.equal(lookup.body.messages.at(-1).decision.tool, "consultar_meus_chamados");
  assert.ok(lookup.body.messages.at(-1).payload.tickets.length >= 1);

  const updateDraft = await postChat(employeeCookie, conversationId, "Quero complementar INC-20311: reiniciei e continua lento.");
  assert.equal(updateDraft.body.conversation.draft.operation, "update");
  const updateSaved = await postChat(employeeCookie, conversationId, "confirmar");
  assert.match(updateSaved.body.messages.at(-1).payload.ticket.description, /continua lento/);

  const transfer = await postChat(employeeCookie, conversationId, "Quero falar com um analista sobre INC-20311");
  assert.equal(transfer.body.conversation.state, "waiting");
  const paused = await postChat(employeeCookie, conversationId, "Ainda está parado");
  assert.equal(paused.response.status, 409);

  const analystCookie = await login("rafael.lima@nexo.com.br");
  const analystPage = await fetch(`${base}/console`, { headers: { Cookie: analystCookie } });
  assert.equal(analystPage.status, 200);
  assert.match(await analystPage.text(), /Conversas/);
  const queue = await json("/api/console", {}, analystCookie);
  assert.ok(queue.body.queue.some((item) => item.conversation.id === conversationId));

  const taken = await json(`/api/console/${conversationId}/take`, { method: "POST" }, analystCookie);
  assert.equal(taken.body.conversation.state, "human");
  const analystReply = await json(`/api/console/${conversationId}/message`, {
    method: "POST",
    body: JSON.stringify({ message: "Vou verificar o chamado com você." }),
  }, analystCookie);
  assert.equal(analystReply.body.message.senderRole, "analyst");
  const returned = await json(`/api/console/${conversationId}/return`, { method: "POST" }, analystCookie);
  assert.equal(returned.body.conversation.state, "agent");

  const secondTransfer = await postChat(employeeCookie, conversationId, "Quero falar com um analista novamente");
  assert.equal(secondTransfer.body.conversation.state, "waiting");
  await json(`/api/console/${conversationId}/take`, { method: "POST" }, analystCookie);
  const closed = await json(`/api/console/${conversationId}/close`, { method: "POST" }, analystCookie);
  assert.equal(closed.body.conversation.state, "closed");

  const logout = await json("/api/auth/logout", { method: "POST" }, analystCookie);
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie") ?? "", /nexo_session=;/i);

  console.log("HTTP smoke test passou: login, páginas, autorização, FAQ, chamados, transferência, console e logout.");
} finally {
  next.kill("SIGTERM");
  await Promise.race([serverExit, new Promise((resolveWait) => setTimeout(resolveWait, 3000))]);
  if (next.exitCode === null) next.kill("SIGKILL");
  rmSync(scratch, { recursive: true, force: true });
}
