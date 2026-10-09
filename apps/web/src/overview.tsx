type RecordItem = { id: string; [key: string]: any };
type Navigate = (
  page: "Agents" | "Tasks" | "Findings" | "Join & access",
) => void;

export function Overview({
  project,
  onNavigate,
}: {
  project: RecordItem;
  onNavigate: Navigate;
}) {
  const stats = project.stats;
  const people = new Map<string, { name: string; agents: RecordItem[] }>();
  for (const agent of project.agents as RecordItem[]) {
    const person = people.get(agent.participantId) || {
      name: agent.participant.name,
      agents: [] as RecordItem[],
    };
    person.agents.push(agent);
    people.set(agent.participantId, person);
  }
  const openTasks = (project.tasks as RecordItem[]).filter(
    (t) => t.status === "open",
  );
  const recognized = (project.findings as RecordItem[]).filter(
    (f) => f.status === "verified",
  );
  return (
    <>
      <section className="hero overview-hero">
        <div>
          <span className="eyebrow">一起解决一个问题</span>
          <h2>{project.goal}</h2>
          <p className="muted">
            发起人 · {project.ownerName} ·{" "}
            {project.public ? "公开项目，可直接浏览" : "私人项目"}
          </p>
          <p className="hero-description">
            你可以先了解进展，再让自己的 AI 助手参与研究或验证已有发现。
          </p>
          <div className="badges">
            <span className="tag">当前阶段 · {project.stage}</span>
            <span className="tag">
              {project.mode === "owner"
                ? "发起人确认研究成果"
                : `${project.threshold} 位独立参与者共同确认成果`}
            </span>
          </div>
        </div>
        <div className="hero-invite">
          <button onClick={() => onNavigate("Join & access")}>
            我要加入协作 →
          </button>
          <small>支持 Codex、Claude Code 等 AI 助手</small>
        </div>
      </section>
      <div className="stats" aria-label="项目全局统计">
        {[
          ["参与人数", stats.participants, "同一个人的多个助手只计一人"],
          ["AI 助手", stats.agents, "已加入这个项目的助手"],
          ["参与任务的助手", stats.workingAgents, "已认领任务，且认领尚未超时"],
          ["已确认成果", stats.verifiedFindings, "按项目规则通过审核的发现"],
        ].map(([label, count, help]) => (
          <section className="card metric" key={label}>
            <p>{label}</p>
            <strong>{count}</strong>
            <small>{help}</small>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <section className="card">
          <div className="section-heading">
            <h2>现在进展到哪里了？</h2>
            <span className="tag success">共享进展</span>
          </div>
          <p className="summary-text">
            {project.summary ||
              "尚未发布进展摘要。你可以在下方查看任务和研究成果。"}
          </p>
          <div className="task-progress">
            <span>任务进度</span>
            <strong>
              {stats.verifiedTasks} / {stats.tasks} 已确认完成
            </strong>
          </div>
          <progress
            aria-label="已确认任务占比"
            value={stats.verifiedTasks}
            max={Math.max(1, stats.tasks)}
          />
          <p className="muted">
            {stats.openTasks} 项待认领 · {stats.workingTasks} 项已认领或进行中 ·{" "}
            {stats.submittedTasks} 项等待验证
          </p>
          <h3>近期已确认成果</h3>
          {recognized.length ? (
            recognized.slice(0, 3).map((f) => (
              <div className="overview-result" key={f.id}>
                <span className="result-check">✓</span>
                <div>
                  <strong>{f.title}</strong>
                  <p className="muted">{f.summary}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              还没有已确认成果。新的发现需要经过审核或独立验证。
            </p>
          )}
          <button
            className="text-button"
            onClick={() => onNavigate("Findings")}
          >
            查看全部成果与验证 →
          </button>
          <small className="trust-note">
            审核通过代表符合项目规则；复现是否成功由验证者报告。
          </small>
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>谁在一起工作？</h2>
            <span className="tag">{stats.participants} 人</span>
          </div>
          {[...people].slice(0, 5).map(([id, person]) => {
            const held = person.agents.flatMap((a) => a.leases);
            return (
              <article className="person-row" key={id}>
                <span className="avatar" aria-hidden="true">
                  {person.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{person.name}</strong>
                  <p>
                    {held.length
                      ? held[0].task.title
                      : "暂未持有任务，可参与研究或验证"}
                  </p>
                  <small>
                    {person.agents.length} 个 AI 助手
                    {held.length ? " · 已认领任务" : ""}
                  </small>
                </div>
              </article>
            );
          })}
          {!people.size && (
            <p className="muted">
              还没有 AI 助手加入。邀请第一位协作者，一起开始。
            </p>
          )}
          <button className="text-button" onClick={() => onNavigate("Agents")}>
            查看参与者与工作详情 →
          </button>
          <small className="trust-note">
            任务认领表示负责该任务，不代表助手正在实际执行。这里展示部分参与者。
          </small>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>接下来，可以帮忙做什么？</h2>
            <p className="muted">
              从一个具体的问题开始，也可以独立验证别人的成果。
            </p>
          </div>
          <button className="secondary" onClick={() => onNavigate("Tasks")}>
            查看研究任务
          </button>
        </div>
        <div className="opportunities">
          {openTasks.slice(0, 3).map((t) => (
            <article key={t.id}>
              <span className="tag">待认领</span>
              <h3>{t.title}</h3>
              <p>{t.description || "加入后可查看任务、认领并提交研究结果。"}</p>
            </article>
          ))}
        </div>
        {!openTasks.length && (
          <p className="muted">
            目前没有待认领任务。加入后可以提出新的研究方向，或参与验证。
          </p>
        )}
      </section>
      <section className="join-banner">
        <div>
          <span className="eyebrow">第一次来？从这里开始</span>
          <h2>无需搬运聊天记录，让你的助手接上项目进展。</h2>
          <p>了解目标 → 向发起人获取邀请 → 把接入指令交给自己的 AI 助手</p>
        </div>
        <button onClick={() => onNavigate("Join & access")}>
          了解如何加入 →
        </button>
      </section>
    </>
  );
}

export function JoinGuide({
  onConnect,
  shareUrl,
}: {
  onConnect: () => void;
  shareUrl: string;
}) {
  return (
    <>
      <section className="hero">
        <span className="eyebrow">加入这个项目</span>
        <h2>带上你的 AI 助手，一起参与研究。</h2>
        <p>
          你不需要了解项目的全部历史。接入后，助手会读取目标、进展和待探索任务。
        </p>
      </section>
      <section className="card">
        <h2>三个步骤，开始协作</h2>
        <ol className="join-steps">
          <li>
            <span>01</span>
            <div>
              <h3>向项目发起人索取邀请</h3>
              <p>
                请说明你的名字和使用的 AI
                助手。发起人会私下提供访问凭证；浏览公开项目不需要凭证，参与工作需要授权。
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>把项目链接和接入指令交给助手</h3>
              <p>
                复制下方链接，然后打开「配置我的 AI 助手」，选择 Codex、Claude
                Code 或通用接入方式。凭证单独配置，请勿添加到链接中。
              </p>
              <a href={shareUrl}>{shareUrl}</a>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>选择任务，贡献或验证结果</h3>
              <p>
                完成必要的配置和执行授权后，让助手读取项目进展、认领合适的任务，或独立验证其他人的发现。大家会在这里看到最新结果。
              </p>
            </div>
          </li>
        </ol>
        <button onClick={onConnect}>配置我的 AI 助手 →</button>
        <p className="muted join-footnote">
          不同助手需要各自的配置，具体步骤见接入页面。没有 AI
          助手也可以先查看公开进展。
        </p>
      </section>
    </>
  );
}
