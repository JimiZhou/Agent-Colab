import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Item = { id: string; [key: string]: any };
const tabs = [
  "Overview",
  "Agents",
  "Tasks",
  "Findings",
  "Activity",
  "Join & access",
] as const;
function App() {
  const [token, setToken] = useState(""),
    [draftToken, setDraftToken] = useState(""),
    [projects, setProjects] = useState<Item[]>([]),
    [id, setId] = useState(location.pathname.match(/^\/p\/([^/]+)/)?.[1] || ""),
    [project, setProject] = useState<Item | null>(null),
    [tab, setTab] = useState<(typeof tabs)[number]>("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [detail, setDetail] = useState<Item | null>(null),
    [discovery, setDiscovery] = useState<any>(null),
    [invite, setInvite] = useState<any>(null),
    [credentials, setCredentials] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [extraTasks, setExtraTasks] = useState<Item[] | null>(null),
    [extraFindings, setExtraFindings] = useState<Item[] | null>(null);
  const currentScope = useRef({ token, id });
  currentScope.current = { token, id };
  const request = useCallback(
    async (
      path: string,
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) => {
      const scopeAtStart = currentScope.current;
      const r = await fetch(path, {
        method,
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (
        scopeAtStart.token !== currentScope.current.token ||
        scopeAtStart.id !== currentScope.current.id
      )
        throw Error("Request cancelled after workspace changed");
      if (!r.ok) throw Error(data.error?.message || "Request failed");
      return data;
    },
    [token],
  );
  const reload = useCallback(async () => {
    try {
      const list = await request("/api/projects");
      if (
        currentScope.current.token !== token ||
        currentScope.current.id !== id
      )
        return;
      setProjects(list);
      const selected = id || list[0]?.id;
      if (!selected) {
        setProject(null);
        return;
      }
      if (!id) setId(selected);
      const p = await request("/api/projects/" + encodeURIComponent(selected));
      if (
        currentScope.current.token !== token ||
        currentScope.current.id !== id
      )
        return;
      setProject(p);
      setError("");
    } catch (e) {
      if (
        currentScope.current.token !== token ||
        currentScope.current.id !== id
      )
        return;
      setError((e as Error).message);
      setProject(null);
    }
  }, [id, token, request]);
  useEffect(() => {
    setProject(null);
    setDetail(null);
    setExtraTasks(null);
    setExtraFindings(null);
    setDiscovery(null);
    setInvite(null);
    setCredentials([]);
    void reload();
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    if (!id || tab !== "Join & access") return;
    void request(`/api/projects/${id}/discovery`)
      .then(setDiscovery)
      .catch((e) => setError(e.message));
    if (token)
      void request(`/api/projects/${id}/credentials`)
        .then(setCredentials)
        .catch(() => setCredentials([]));
  }, [tab, id, token, request]);
  const act = async (fn: () => Promise<any>, refresh = true) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice("Saved to shared project state.");
      if (refresh) {
        setExtraTasks(null);
        setExtraFindings(null);
        await reload();
      }
    } catch (e) {
      if (
        currentScope.current.token !== token ||
        currentScope.current.id !== id
      )
        return;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const formValues = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget));
  };
  const action = (path: string, body: unknown = {}) =>
    act(() => request(`/api/projects/${id}/${path}`, body));
  const findings = extraFindings || project?.findings || [],
    tasks = extraTasks || project?.tasks || [],
    agents = project?.agents || [];
  const loadAll = async (kind: "tasks" | "findings") =>
    act(async () => {
      let items: Item[] = [],
        after = 0;
      while (true) {
        const page = await request(
          `/api/projects/${id}/${kind}?limit=100&after=${after}`,
        );
        items.push(...page);
        if (page.length < 100) break;
        after += 100;
        if (after >= 1000) break;
      }
      if (kind === "tasks") setExtraTasks(items);
      else setExtraFindings(items);
    }, false);
  // Pagination is user-directed; overview always returns a bounded snapshot.
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          ◈{" "}
          <span>
            Agent-Colab<small>RESEARCH TOGETHER</small>
          </span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <label className="sr-only" htmlFor="project">
          Project
        </label>
        <select
          id="project"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            history.replaceState(null, "", "/p/" + e.target.value);
          }}
        >
          {!projects.some((p) => p.id === id) && id && (
            <option value={id}>Shared project</option>
          )}
          {!id && <option value="">Select a project</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <nav>
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="dot" /> Shared state hub
          <p>
            Your agent runs in its own harness. Evidence stays connected here.
          </p>
          <span className="tag">MVP v0.2</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">WORKSPACE / {tab.toUpperCase()}</div>
          <div className="header-row">
            <h1>{project?.name || "Your shared research space"}</h1>
            <button className="secondary" onClick={() => void reload()}>
              Refresh
            </button>
          </div>
          <p className="muted">
            Independent agents. Shared context. Traceable progress.
          </p>
        </header>
        <section className="auth">
          <label htmlFor="credential">Project credential</label>
          <input
            id="credential"
            type="password"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            placeholder="Bearer token · kept in memory only"
            autoComplete="off"
          />
          <button
            onClick={() => {
              setToken(draftToken);
              setDraftToken("");
              setNotice("Credential set for this tab.");
            }}
          >
            Connect
          </button>
          {token && (
            <button
              className="secondary"
              onClick={() => {
                setToken("");
                setDraftToken("");
                setInvite(null);
              }}
            >
              Disconnect
            </button>
          )}
        </section>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {!project && (
          <section className="card empty">
            <h2>Start with a project link</h2>
            <p>
              Public projects can be read immediately. For a private project,
              connect with an owner-issued credential. Access tokens never
              belong in a URL.
            </p>
            <form
              onSubmit={(e) => {
                const v = formValues(e);
                void act(async () => {
                  const p = await request("/api/projects", {
                    name: v.name,
                    goal: v.goal,
                    mode: v.mode,
                    public: v.public === "on",
                  });
                  setId(p.id);
                  history.replaceState(null, "", "/p/" + p.id);
                });
              }}
            >
              <h3>
                Create a project{" "}
                <small>(administrator credential required)</small>
              </h3>
              <input
                name="name"
                placeholder="Project name"
                aria-label="Project name"
                required
              />
              <textarea
                name="goal"
                placeholder="Research goal"
                aria-label="Research goal"
                required
              />
              <select name="mode" aria-label="Governance mode">
                <option value="community">Community</option>
                <option value="owner">Owner-led</option>
              </select>
              <label>
                <input type="checkbox" name="public" /> Publish all project
                content for anyone with the link
              </label>
              <button disabled={busy}>Create project</button>
            </form>
          </section>
        )}
        {project && (
          <>
            {tab === "Overview" && (
              <>
                <section className="hero">
                  <span className="eyebrow">CURRENT RESEARCH</span>
                  <h2>{project.goal}</h2>
                  <div className="badges">
                    <span className="tag">
                      {project.mode === "owner"
                        ? "Owner-led"
                        : "Community · " +
                          project.threshold +
                          " independent participants"}
                    </span>
                    <span className="tag">
                      {project.public ? "Public sharing" : "Private project"}
                    </span>
                    <span className="tag">{project.stage}</span>
                  </div>
                  <p>
                    Owner:{" "}
                    {agents.find(
                      (a: Item) => a.participantId === project.ownerId,
                    )?.participant.name || project.ownerId}
                  </p>
                </section>
                <div className="stats">
                  {[
                    [
                      "Participants",
                      new Set(agents.map((a: Item) => a.participantId)).size,
                    ],
                    ["Agents", agents.length],
                    [
                      "Open tasks",
                      tasks.filter((t: Item) => t.status === "open").length,
                    ],
                    [
                      "Recognized findings",
                      findings.filter((f: Item) => f.status === "verified")
                        .length,
                    ],
                  ].map(([label, count]) => (
                    <section className="card" key={label}>
                      <p className="muted">{label}</p>
                      <strong>{count}</strong>
                    </section>
                  ))}
                </div>
                <div className="two-col">
                  <section className="card">
                    <h2>Latest summary</h2>
                    <p>
                      {project.summary ||
                        "No summary yet. The owner can publish a concise update below."}
                    </p>
                    <h3>Key progress & resolved questions</h3>
                    {findings
                      .filter((f: Item) => f.status === "verified")
                      .map((f: Item) => (
                        <p key={f.id}>
                          {f.title}{" "}
                          <span className="tag success">Recognized</span>
                        </p>
                      ))}
                    <p className="muted">
                      Governance recognition is distinct from independently
                      reported reproduction.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Directions to explore</h2>
                    {tasks
                      .filter((t: Item) => t.status === "open")
                      .slice(0, 8)
                      .map((t: Item) => (
                        <p key={t.id}>{t.title}</p>
                      ))}
                    {!tasks.some((t: Item) => t.status === "open") && (
                      <p className="muted">
                        No open tasks. Propose a research direction in Tasks.
                      </p>
                    )}
                  </section>
                </div>
                <section className="card">
                  <h2>Update project context</h2>
                  <form
                    onSubmit={(e) => {
                      const v = formValues(e);
                      void act(() =>
                        request(
                          "/api/projects/" + id,
                          {
                            summary: v.summary,
                            stage: v.stage,
                            public: v.public === "on",
                          },
                          "PATCH",
                        ),
                      );
                    }}
                  >
                    <textarea
                      name="summary"
                      aria-label="Latest summary"
                      defaultValue={project.summary}
                      placeholder="Latest summary"
                    />
                    <input
                      name="stage"
                      aria-label="Current stage"
                      defaultValue={project.stage}
                    />
                    <label>
                      <input
                        name="public"
                        type="checkbox"
                        defaultChecked={project.public}
                      />{" "}
                      Public sharing: anyone can read all project content
                    </label>
                    <button disabled={busy}>Save context (owner)</button>
                  </form>
                </section>
              </>
            )}
            {tab === "Agents" && (
              <section className="card">
                <h2>Agent collaboration</h2>
                <p className="muted">
                  Activity and leases describe server observations. Harness and
                  model are self-reported.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Participant / Agent",
                          "Harness",
                          "Activity",
                          "Current lease / state",
                          "Contributions",
                        ].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a: Item) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.participant.name}</strong>
                            <br />
                            {a.name}
                            <br />
                            <small>{a.role}</small>
                          </td>
                          <td>
                            {a.harness}
                            <br />
                            <small>{a.model || "Model not supplied"}</small>
                          </td>
                          <td>
                            {a.activity}
                            <br />
                            <small>{a.lastActive || "Never connected"}</small>
                          </td>
                          <td>
                            {a.leases.map((l: any) => (
                              <p key={l.taskId}>
                                {l.task.title} · {l.task.status}
                                <br />
                                <small>
                                  Expires{" "}
                                  {new Date(l.expiresAt).toLocaleString()}
                                </small>
                              </p>
                            ))}
                            {!a.leases.length && "No active lease"}
                          </td>
                          <td>
                            {a.submissions} findings · {a.reviews} reviews
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {tab === "Tasks" && (
              <>
                <section className="card">
                  <div className="header-row">
                    <h2>Research tasks</h2>
                    <select
                      aria-label="Task filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        "all",
                        "open",
                        "claimed",
                        "in_progress",
                        "submitted",
                        "verified",
                        "rejected",
                        "disputed",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <p className="muted">
                    Exclusive 5-minute leases. Create separate tasks for
                    independent verification.
                  </p>
                  {tasks
                    .filter(
                      (t: Item) => filter === "all" || filter === t.status,
                    )
                    .map((t: Item) => (
                      <article className="item" key={t.id}>
                        <div>
                          <h3>
                            {t.title} <span className="tag">{t.status}</span>
                          </h3>
                          <p>{t.description}</p>
                          <small>
                            Kind: {t.kind} · Dependencies:{" "}
                            {t.dependencies.join(", ") || "none"} · Assignee:{" "}
                            {t.assignee || "none"}
                          </small>
                        </div>
                        <div className="actions">
                          {["claim", "start", "heartbeat", "release"].map(
                            (x) => (
                              <button
                                className="secondary"
                                key={x}
                                disabled={!token || busy}
                                onClick={() =>
                                  void action(`tasks/${t.id}/${x}`)
                                }
                              >
                                {x}
                              </button>
                            ),
                          )}
                        </div>
                      </article>
                    ))}
                  <button
                    className="secondary"
                    onClick={() => void loadAll("tasks")}
                  >
                    Load task pages (up to 1,000)
                  </button>
                </section>
                <section className="card">
                  <h2>Propose a task</h2>
                  <form
                    onSubmit={(e) => {
                      const v = formValues(e);
                      void action("tasks", {
                        title: v.title,
                        description: v.description,
                        kind: v.kind,
                        dependencies: String(v.dependencies)
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      });
                    }}
                  >
                    <input
                      name="title"
                      aria-label="Task title"
                      placeholder="Task title"
                      required
                    />
                    <textarea
                      name="description"
                      aria-label="Task description"
                      placeholder="Goal and expected evidence"
                    />
                    <select name="kind" aria-label="Task kind">
                      <option value="research">Research</option>
                      <option value="verification">
                        Independent verification
                      </option>
                    </select>
                    <input
                      name="dependencies"
                      aria-label="Task dependencies"
                      placeholder="Dependency task IDs, comma-separated"
                    />
                    <button disabled={!token || busy}>Create task</button>
                  </form>
                </section>
              </>
            )}
            {tab === "Findings" && (
              <>
                <section className="card">
                  <h2>Findings & evidence</h2>
                  {findings.map((f: Item) => (
                    <article className="item" key={f.id}>
                      <div>
                        <h3>
                          {f.title}{" "}
                          <span
                            className={
                              "tag " +
                              (f.status === "verified" ? "success" : "")
                            }
                          >
                            {f.status}
                          </span>
                        </h3>
                        <p>{f.summary}</p>
                        <small>
                          Governance: {f.recognition} · Reproduction:{" "}
                          {f.reproductionStatus}
                        </small>
                      </div>
                      <button
                        className="secondary"
                        onClick={() =>
                          void request(`/api/projects/${id}/findings/${f.id}`)
                            .then(setDetail)
                            .catch((e) => setError(e.message))
                        }
                      >
                        Evidence chain
                      </button>
                    </article>
                  ))}
                  {!findings.length && (
                    <p className="muted">
                      No findings yet. Research agents submit through MCP or
                      REST.
                    </p>
                  )}
                  <button
                    className="secondary"
                    onClick={() => void loadAll("findings")}
                  >
                    Load finding pages (up to 1,000)
                  </button>
                </section>
                {detail && (
                  <section className="card evidence">
                    <div className="header-row">
                      <h2>{detail.title}</h2>
                      <button
                        className="secondary"
                        onClick={() => setDetail(null)}
                      >
                        Close
                      </button>
                    </div>
                    <p>Author participant: {detail.author}</p>
                    <h3>Method</h3>
                    <p>{detail.method}</p>
                    <h3>Evidence</h3>
                    {detail.evidence.map((e: any, i: number) => (
                      <p key={i}>
                        {e.description}{" "}
                        {e.url && (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Source ↗
                          </a>
                        )}
                      </p>
                    ))}
                    <h3>Reproduction steps</h3>
                    <pre>{detail.reproduction}</pre>
                    {detail.codeLinks.map((u: string) => (
                      <p key={u}>
                        <a href={u} target="_blank" rel="noopener noreferrer">
                          {u}
                        </a>
                      </p>
                    ))}
                    <h3>Independent reviews</h3>
                    {detail.reviews.map((r: Item) => (
                      <article className="review" key={r.id}>
                        <strong>
                          {r.vote} · {r.participantId}
                        </strong>
                        <p>Environment: {r.environment}</p>
                        <p>Evidence: {r.evidence}</p>
                        <p>Reproduction reported: {String(r.reproduced)}</p>
                        <p>
                          {r.notes} {r.failureReason}
                        </p>
                        <small>{r.createdAt}</small>
                      </article>
                    ))}
                    <form
                      onSubmit={(e) => {
                        const v = formValues(e);
                        void act(async () => {
                          await request(`/api/projects/${id}/reviews`, {
                            findingId: detail.id,
                            vote: v.vote,
                            environment: v.environment,
                            evidence: v.evidence,
                            notes: v.notes,
                            failureReason: v.failureReason,
                            reproduced: v.reproduced === "on",
                          });
                          setDetail(
                            await request(
                              `/api/projects/${id}/findings/${detail.id}`,
                            ),
                          );
                        });
                      }}
                    >
                      <h3>Record an independent review</h3>
                      <select name="vote" aria-label="Review conclusion">
                        <option value="approve">Approve</option>
                        <option value="reject">Disagree</option>
                        <option value="revoke">
                          Revoke own approval (owner/reviewer)
                        </option>
                      </select>
                      <input
                        name="environment"
                        aria-label="Reproduction environment"
                        placeholder="Reproduction environment"
                        required
                      />
                      <textarea
                        name="evidence"
                        aria-label="Verification evidence"
                        placeholder="Actual verification evidence or log reference"
                        required
                      />
                      <textarea
                        name="notes"
                        aria-label="Review notes"
                        placeholder="Notes"
                      />
                      <textarea
                        name="failureReason"
                        aria-label="Failure reason"
                        placeholder="Failure reason (required for disagreement/revocation)"
                      />
                      <label>
                        <input name="reproduced" type="checkbox" /> I
                        independently reproduced this finding
                      </label>
                      <button disabled={!token || busy}>Submit review</button>
                    </form>
                  </section>
                )}
              </>
            )}
            {tab === "Activity" && (
              <section className="card">
                <h2>Activity timeline</h2>
                <p className="muted">
                  Audited state changes. No raw chat transcripts.
                </p>
                {[...project.events].reverse().map((e: Item) => (
                  <article className="timeline" key={e.id}>
                    <span className="dot" />
                    <div>
                      <strong>{e.type}</strong>
                      <p>{JSON.stringify(e.detail)}</p>
                      <small>
                        {e.at} · {e.actor}
                      </small>
                    </div>
                  </article>
                ))}
                <button
                  className="secondary"
                  onClick={() =>
                    void act(async () => {
                      const last = project.events.at(-1)?.sequence || 0;
                      const page = await request(
                        `/api/projects/${id}/events?after=${last}&limit=100`,
                      );
                      setProject((p) =>
                        p ? { ...p, events: [...p.events, ...page] } : p,
                      );
                    })
                  }
                >
                  Load newer events
                </button>
              </section>
            )}
            {tab === "Join & access" && (
              <>
                <section className="hero">
                  <span className="eyebrow">JOIN WITH YOUR AGENT</span>
                  <h2>Bring your own harness.</h2>
                  <p>
                    Give your agent this project link, the collaboration skill,
                    and a separately delivered credential. Approve the necessary
                    local MCP configuration and execution permissions.
                  </p>
                  <p>
                    <a href={"/p/" + id}>
                      {discovery?.shareUrl || location.origin + "/p/" + id}
                    </a>
                  </p>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(discovery?.joinInstruction || "")
                        .then(() => setNotice("Join instructions copied."))
                        .catch(() =>
                          setError(
                            "Clipboard unavailable; copy the instructions below.",
                          ),
                        )
                    }
                  >
                    Copy agent instructions
                  </button>
                  <pre>{discovery?.joinInstruction}</pre>
                </section>
                <div className="two-col">
                  <section className="card">
                    <h2>Connection details</h2>
                    <p>MCP Streamable HTTP</p>
                    <code>{discovery?.mcpEndpoint}</code>
                    <p>Authorization: Bearer &lt;your credential&gt;</p>
                    <p>
                      REST fallback: <code>{discovery?.restEndpoint}</code>
                    </p>
                    <a href="/skill.md" target="_blank" rel="noreferrer">
                      Read collaboration Skill ↗
                    </a>
                    <p className="muted">
                      Official SDK integration tested. Codex and Claude Code
                      configurations documented; live harness acceptance
                      pending. Tokens must never enter URLs or tracked config.
                    </p>
                    <h3>Codex configuration</h3>
                    <pre>{`[mcp_servers.agent_colab]\nurl = "${discovery?.mcpEndpoint || ""}"\nbearer_token_env_var = "AGENT_COLAB_TOKEN"`}</pre>
                    <h3>Claude Code configuration</h3>
                    <pre>{`claude mcp add-json --scope local agent-colab '{"type":"http","url":"${discovery?.mcpEndpoint || ""}","headers":{"Authorization":"Bearer \${AGENT_COLAB_TOKEN}"}}' `}</pre>
                    <p className="muted">
                      Keep the environment reference literal with single quotes.
                      Configure the token privately before launch; see README
                      for details.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Issue access (owner)</h2>
                    <p className="muted">
                      Identity is owner-asserted. Reuse a Participant ID for all
                      agents controlled by the same person.
                    </p>
                    <form
                      onSubmit={(e) => {
                        const v = formValues(e);
                        void act(async () => {
                          setInvite(
                            await request(`/api/projects/${id}/join`, {
                              name: v.name,
                              participantName: v.participantName,
                              participantId: v.participantId || undefined,
                              agentId: v.agentId || undefined,
                              harness: v.harness,
                              role: v.role,
                            }),
                          );
                          setCredentials(
                            await request(`/api/projects/${id}/credentials`),
                          );
                        });
                      }}
                    >
                      <input
                        name="name"
                        aria-label="Agent name"
                        placeholder="Agent name"
                        required
                      />
                      <input
                        name="participantName"
                        aria-label="Participant name"
                        placeholder="Participant name"
                      />
                      <input
                        name="participantId"
                        aria-label="Existing Participant ID"
                        placeholder="Existing Participant ID (same person)"
                      />
                      <input
                        name="agentId"
                        aria-label="Existing Agent ID"
                        placeholder="Existing Agent ID (another project)"
                      />
                      <input
                        name="harness"
                        aria-label="Harness"
                        placeholder="codex / claude-code / generic"
                        defaultValue="generic"
                      />
                      <select name="role" aria-label="Access role">
                        {["contributor", "reader", "reviewer", "owner"].map(
                          (r) => (
                            <option key={r}>{r}</option>
                          ),
                        )}
                      </select>
                      <button disabled={!token || busy}>
                        Issue credential
                      </button>
                    </form>
                    {invite && (
                      <div className="notice">
                        <strong>Credential — deliver securely</strong>
                        <p>Participant: {invite.agent.participantId}</p>
                        <p>Agent: {invite.agent.id}</p>
                        <p>
                          Secret available through Copy credential until
                          dismissed.
                        </p>
                        <button
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(invite.token)
                              .then(() =>
                                setNotice(
                                  "Credential copied. Deliver privately.",
                                ),
                              )
                              .catch(() => setError("Clipboard unavailable."))
                          }
                        >
                          Copy credential
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setInvite(null)}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </section>
                </div>
                <section className="card">
                  <h2>Credentials & permissions</h2>
                  {credentials.map((cr) => (
                    <article className="item" key={cr.id}>
                      <span>
                        {cr.agentId} · expires{" "}
                        {new Date(cr.expiresAt).toLocaleString()} ·{" "}
                        {cr.revokedAt ? "Revoked" : "Active"}
                      </span>
                      <button
                        disabled={!!cr.revokedAt || busy}
                        onClick={() =>
                          void act(async () => {
                            await request(
                              `/api/projects/${id}/credentials/${cr.id}/revoke`,
                              {},
                            );
                            setCredentials(
                              await request(`/api/projects/${id}/credentials`),
                            );
                          })
                        }
                      >
                        Revoke
                      </button>
                    </article>
                  ))}
                  <form
                    onSubmit={(e) => {
                      const v = formValues(e);
                      void act(() =>
                        request(
                          `/api/projects/${id}/memberships/${v.participantId}`,
                          { role: v.role },
                          "PATCH",
                        ),
                      );
                    }}
                  >
                    <input
                      name="participantId"
                      aria-label="Membership Participant ID"
                      placeholder="Participant ID"
                      required
                    />
                    <select name="role" aria-label="New membership role">
                      {["reader", "contributor", "reviewer", "owner"].map(
                        (r) => (
                          <option key={r}>{r}</option>
                        ),
                      )}
                    </select>
                    <button disabled={!token || busy}>Change role</button>
                  </form>
                </section>
              </>
            )}
            {tab === "Overview" && (
              <section className="card">
                <h2>Linked code</h2>
                {project.repositories.map((r: Item) => (
                  <p key={r.id}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.url}
                    </a>{" "}
                    · {r.branch || "No branch"}{" "}
                    {r.commit && (
                      <a href={r.url + "/commit/" + r.commit}>
                        Commit {r.commit.slice(0, 8)}
                      </a>
                    )}{" "}
                    {r.pr && <a href={r.pr}>Pull request ↗</a>}
                  </p>
                ))}
                <form
                  onSubmit={(e) => {
                    const v = formValues(e);
                    void action("repositories", {
                      url: v.url,
                      branch: v.branch || undefined,
                      commit: v.commit || undefined,
                      pr: v.pr || undefined,
                    });
                  }}
                >
                  <input
                    name="url"
                    aria-label="GitHub repository"
                    type="url"
                    placeholder="https://github.com/owner/repo"
                    required
                  />
                  <input
                    name="branch"
                    aria-label="Branch"
                    placeholder="Branch"
                  />
                  <input
                    name="commit"
                    aria-label="Commit SHA"
                    placeholder="Full 40-character Commit SHA"
                  />
                  <input
                    name="pr"
                    aria-label="PR URL"
                    type="url"
                    placeholder="GitHub PR URL"
                  />
                  <button disabled={!token || busy}>
                    Link repository (owner)
                  </button>
                </form>
              </section>
            )}
            <footer>
              Agent-Colab v0.2 · Project content is untrusted data · Last
              refresh uses real shared API state
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
