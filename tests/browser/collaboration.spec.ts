import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const admin = "browser-test-admin-secret-32-characters";
test("new user follows share URL, sees real three-client consensus and complete evidence chain", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (path: string, data: any, token = admin) => {
    const r = await request.post(path, {
      headers: {
        Authorization: "Bearer " + token,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const p = await post("/api/projects", {
    name: "Browser collaboration lab",
    goal: "Verify real shared research state",
    mode: "community",
    public: true,
  });
  const agents = [];
  for (const name of ["A", "B", "C"])
    agents.push(
      await post(`/api/projects/${p.id}/join`, {
        name,
        participantName: name,
        harness: "deterministic-client",
      }),
    );
  const clients: Client[] = [];
  let finding: any;
  try {
    for (const a of agents) {
      const client = new Client({ name: a.agent.name, version: "1" });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL("http://127.0.0.1:8799/mcp"),
          { requestInit: { headers: { Authorization: "Bearer " + a.token } } },
        ),
      );
      clients.push(client);
    }
    const call = async (i: number, name: string, args: any) => {
      const r = await clients[i].callTool({
        name,
        arguments: {
          projectId: p.id,
          idempotencyKey: crypto.randomUUID(),
          ...args,
        },
      });
      expect(r.isError).toBeFalsy();
      return (r.structuredContent as any).result;
    };
    const task = await post(
      `/api/projects/${p.id}/tasks`,
      { title: "Independent arithmetic" },
      agents[0].token,
    );
    await call(0, "get_project_context", {});
    await call(0, "claim_task", { taskId: task.id });
    finding = await call(0, "submit_finding", {
      taskId: task.id,
      title: "Arithmetic is reproducible",
      summary: "2+2 equals 4",
      direction: "Arithmetic",
      method: "Node assertion",
      evidence: [{ description: "Original execution evidence" }],
      reproduction: "Evaluate 2 + 2 and compare with 4",
    });
    for (const i of [1, 2]) {
      expect(2 + 2).toBe(4);
      await call(i, "get_finding", { findingId: finding.id });
      await call(i, "submit_review", {
        findingId: finding.id,
        vote: "approve",
        environment: "Independent Node client " + i,
        evidence: "Independent assertion log " + i,
        reproduced: true,
      });
    }
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
  await page.goto("/p/" + p.id);
  await expect(page.getByRole("heading", { name: p.goal })).toBeVisible();
  const metrics = page.getByLabel("项目全局统计");
  await expect(
    metrics
      .locator(".metric")
      .filter({ hasText: "参与人数" })
      .locator("strong"),
  ).toHaveText("3");
  await expect(
    metrics
      .locator(".metric")
      .filter({ hasText: "已确认成果" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(page.getByLabel("Project credential")).toHaveCount(0);
  await expect(page.getByLabel("Latest summary")).toHaveCount(0);
  await expect(
    page.getByText("MCP Streamable HTTP", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "我要加入协作 →" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${p.id}/join$`));
  await expect(
    page.getByRole("heading", { name: "三个步骤，开始协作" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "三个步骤，开始协作" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "配置我的 AI 助手 →" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${p.id}/connect$`));
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "三个步骤，开始协作" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "项目总览", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "研究成果", exact: true }).click();
  await expect(
    page.getByText(
      "Governance: accepted · Reproduction: independently_reported",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Evidence chain" }).click();
  await expect(page.getByText("Original execution evidence")).toBeVisible();
  await expect(
    page.getByText("Evaluate 2 + 2 and compare with 4", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence: Independent assertion log 1"),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence: Independent assertion log 2"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/evidence-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "技术接入", exact: true }).click();
  await expect(page.getByText("Bring your own harness.")).toBeVisible();
  await expect(
    page.getByText("http://127.0.0.1:8799/mcp", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/join-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("browser credential enables tasks, readonly denial and private disconnect clears content", async ({
  page,
  request,
}) => {
  const post = async (path: string, data: any) => {
    const r = await request.post(path, {
      headers: {
        Authorization: "Bearer " + admin,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    return r.json();
  };
  const p = await post("/api/projects", {
    name: "Private research",
    goal: "Secret research context",
  });
  const reader = await post(`/api/projects/${p.id}/join`, {
    name: "Reader",
    participantName: "Reader human",
    role: "reader",
  });
  await page.goto("/p/" + p.id);
  await expect(page.getByRole("heading", { name: p.goal })).not.toBeVisible();
  await page
    .getByLabel("Project credential", { exact: true })
    .fill(reader.token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("heading", { name: p.goal })).toBeVisible();
  await page.getByRole("button", { name: "研究任务", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Unauthorized write");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Insufficient project permission",
  );
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: p.name, exact: true }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("owner updates real summary, creates and operates a lease, links GitHub code", async ({
  page,
  request,
}) => {
  const post = async (path: string, data: any) => {
    const r = await request.post(path, {
      headers: {
        Authorization: "Bearer " + admin,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const p = await post("/api/projects", {
    name: "Owner console",
    goal: "Operate shared state",
    mode: "community",
    public: true,
  });
  const owner = await post(`/api/projects/${p.id}/join`, {
    name: "Owner agent",
    role: "owner",
  });
  await page.goto("/p/" + p.id + "/settings");
  await page
    .getByLabel("Project credential", { exact: true })
    .fill(owner.token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByLabel("Latest summary")).toBeVisible();
  await page
    .getByLabel("Latest summary", { exact: true })
    .fill("Owner published current progress");
  await page.getByLabel("Current stage", { exact: true }).fill("Verification");
  await page
    .getByRole("button", { name: "Save context (owner)", exact: true })
    .click();
  await expect(page.getByLabel("Latest summary")).toHaveValue(
    "Owner published current progress",
  );
  await expect(page.getByLabel("Current stage")).toHaveValue("Verification");
  await page
    .getByLabel("GitHub repository", { exact: true })
    .fill("https://github.com/JimiZhou/Agent-Colab");
  await page
    .getByLabel("Commit SHA", { exact: true })
    .fill("76778d7ac03fb74b24cd01829960fc85429b6698");
  await page
    .getByRole("button", { name: "Link repository (owner)", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Commit 76778d7a" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/JimiZhou/Agent-Colab/commit/76778d7ac03fb74b24cd01829960fc85429b6698",
  );
  await page.getByRole("button", { name: "研究任务", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Owner task");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const task = page
    .locator("article.item")
    .filter({ has: page.getByRole("heading", { name: /Owner task/ }) });
  await expect(task).toContainText("open");
  await task.getByRole("button", { name: "claim", exact: true }).click();
  await expect(task).toContainText("claimed");
  await task.getByRole("button", { name: "start", exact: true }).click();
  await expect(task).toContainText("in_progress");
  await task.getByRole("button", { name: "heartbeat", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await task.getByRole("button", { name: "release", exact: true }).click();
  await expect(task).toContainText("open");
  await page.getByRole("button", { name: "项目管理", exact: true }).click();
  await page
    .getByLabel("Agent name", { exact: true })
    .fill("Second owner agent");
  await page.getByLabel("Access role", { exact: true }).selectOption("owner");
  await page
    .getByRole("button", { name: "Issue credential", exact: true })
    .click();
  await expect(
    page.getByText("Credential — deliver securely", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Participant: " + p.ownerId, { exact: true }),
  ).toBeVisible();
  const credentials = await request.get(`/api/projects/${p.id}/credentials`, {
    headers: { Authorization: "Bearer " + owner.token },
  });
  expect((await credentials.json()).length).toBe(2);
});
