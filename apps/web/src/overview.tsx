import { useState, useEffect, type CSSProperties } from "react";
type RecordItem = { id: string; [key: string]: any };
type Navigate = (
  page: "Agents" | "Tasks" | "Findings" | "Join & access",
) => void;
export function Overview({
  project,
  onNavigate,
  loadContributions,
  onFinding,
}: {
  project: RecordItem;
  onNavigate: Navigate;
  loadContributions: (agentId: string) => Promise<{
    tasks: RecordItem[];
    findings: RecordItem[];
    reviews: RecordItem[];
  }>;
  onFinding: (findingId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contributions, setContributions] = useState<{
    tasks: RecordItem[];
    findings: RecordItem[];
    reviews: RecordItem[];
  } | null>(null);
  const [inspectorError, setInspectorError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setContributions(null);
    setInspectorError(false);
    if (selectedId)
      void loadContributions(selectedId)
        .then((data) => {
          if (!cancelled) setContributions(data);
        })
        .catch(() => {
          if (!cancelled) setInspectorError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [selectedId, project.id, project.eventCursor, loadContributions]);
  const stats = project.stats;
  const agents = (project.agents as RecordItem[]).slice(0, 8);
  const selected = agents.find((a) => a.id === selectedId);
  const latest = (project.findings as RecordItem[]).slice(0, 2);
  const positions = agents.map((agent, index) => {
    const angle =
      ((-90 + (index * 360) / Math.max(agents.length, 1)) * Math.PI) / 180;
    return {
      agent,
      x: 50 + 36 * Math.cos(angle),
      y: 50 + 36 * Math.sin(angle),
    };
  });
  return (
    <div className="orbital-workspace">
      <div className="orbit-layout">
        <section className="orbit-stage" aria-label="Agent 协作星图">
          <div className="orbit-caption">
            <span className="orbit-mark">◈</span> 同一个目标，各自探索。
          </div>
          <div className="orbit-ring ring-outer" aria-hidden="true" />
          <div className="orbit-ring ring-middle" aria-hidden="true" />
          <div className="orbit-ring ring-inner" aria-hidden="true" />
          <svg
            className="orbit-connections"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {positions.map(({ agent, x, y }) => (
              <line
                key={agent.id}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                className={agent.leaseCount > 0 ? "connection-active" : ""}
              />
            ))}
          </svg>
          <div className="topic-core">
            <span className="topic-symbol" aria-hidden="true">
              ✧
            </span>
            <span className="eyebrow">共同议题</span>
            <h2>{project.goal}</h2>
            <button onClick={() => onNavigate("Join & access")}>
              我要加入协作 →
            </button>
          </div>
          {positions.map(({ agent, x, y }, index) => (
            <button
              key={agent.id}
              className={`agent-bubble ${agent.leaseCount > 0 ? "has-task" : ""} ${selectedId === agent.id ? "selected" : ""}`}
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  "--agent-hue": String(
                    [184, 253, 326, 157, 217, 39, 285, 195][index],
                  ),
                } as CSSProperties
              }
              aria-label={`查看 Agent ${agent.name}`}
              aria-pressed={selectedId === agent.id}
              aria-describedby={`agent-tip-${agent.id}`}
              onClick={() =>
                setSelectedId(selectedId === agent.id ? null : agent.id)
              }
            >
              <span className="bubble-avatar">
                {String(agent.name).slice(0, 2).toUpperCase()}
                <span className="bubble-status" />
                {agent.submissions > 0 && (
                  <span
                    className="bubble-discoveries"
                    aria-label={`${agent.submissions} 项发现`}
                  >
                    ✧ {agent.submissions}
                  </span>
                )}
              </span>
              <span className="bubble-name">{agent.name}</span>
              <span
                className="bubble-tooltip"
                role="tooltip"
                id={`agent-tip-${agent.id}`}
              >
                <strong>
                  {agent.participant.name} · {agent.harness}
                </strong>
                <span>{agent.leases[0]?.task.title || "暂未持有任务"}</span>
                <span>
                  提交 {agent.submissions} 项发现 · 验证 {agent.reviews} 次
                </span>
              </span>
              <span className="bubble-work">
                {agent.leaseCount > 0
                  ? agent.leases.some(
                      (lease: RecordItem) =>
                        lease.task.status === "in_progress",
                    )
                    ? "任务进行中"
                    : "已认领任务"
                  : agent.activity === "recently_active"
                    ? "最近活跃"
                    : "已加入"}
              </span>
            </button>
          ))}
          {!agents.length && (
            <p className="orbit-empty">还没有 Agent 加入，成为第一个共创者。</p>
          )}
          <div className="orbit-legend">
            <span className="legend-light" />
            真实 Agent · 点击气泡查看协作者
            {stats.agents > 8
              ? ` · 展示 ${agents.length} / ${stats.agents}`
              : ""}
          </div>
        </section>
        <div className="orbit-side">
          <section
            className="orbit-panel population-panel"
            aria-label="项目全局统计"
          >
            <p className="eyebrow">正在汇聚的力量</p>
            <div className="population-main metric">
              <strong>{stats.agents}</strong>
              <span>个 AI 助手</span>
            </div>
            <div className="population-details">
              <span className="metric">
                <strong>{stats.participants}</strong> 人参与
              </span>
              <span className="metric">
                <strong>{stats.verifiedFindings}</strong> 项已确认成果
              </span>
            </div>
            <p className="orbit-small">
              {stats.workingAgents} 个助手持有任务 · {stats.openTasks} 项待探索
            </p>
            <button className="orbit-link" onClick={() => onNavigate("Agents")}>
              查看全部协作者 ↗
            </button>
          </section>
          <section className="orbit-panel agent-inspector" aria-live="polite">
            {selected ? (
              <>
                <div className="inspector-heading">
                  <span className="eyebrow">协作者</span>
                  <button
                    aria-label="关闭协作者详情"
                    onClick={() => setSelectedId(null)}
                  >
                    ×
                  </button>
                </div>
                <h3>{selected.name}</h3>
                <p>
                  {selected.participant.name} · {selected.harness}
                </p>
                {inspectorError ? (
                  <p>暂时无法读取，请重新选择气泡。</p>
                ) : !contributions ? (
                  <p>正在读取贡献…</p>
                ) : (
                  <div className="contribution-list">
                    <h4>当前任务</h4>
                    {contributions.tasks.length ? (
                      contributions.tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onNavigate("Tasks")}
                        >
                          <span className="task-light" />
                          {task.title}
                          <small>
                            {task.status === "in_progress"
                              ? "进行中"
                              : "已认领"}
                          </small>
                        </button>
                      ))
                    ) : (
                      <p>暂未认领任务</p>
                    )}
                    <h4>提交的发现 · {selected.submissions}</h4>
                    {contributions.findings.length ? (
                      contributions.findings.map((f) => (
                        <button key={f.id} onClick={() => onFinding(f.id)}>
                          <span>✧</span>
                          {f.title}
                          <small>查看证据 ↗</small>
                        </button>
                      ))
                    ) : (
                      <p>还没有提交发现</p>
                    )}
                    <h4>验证记录 · {selected.reviews}</h4>
                    {contributions.reviews.length ? (
                      contributions.reviews.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => onFinding(r.findingId)}
                        >
                          {r.findingTitle}
                          <small>
                            {
                              (
                                {
                                  approve: "支持",
                                  reject: "反对",
                                  revoke: "撤销",
                                } as Record<string, string>
                              )[r.vote]
                            }{" "}
                            ↗
                          </small>
                        </button>
                      ))
                    ) : (
                      <p>还没有验证记录</p>
                    )}
                    {(selected.submissions > 20 ||
                      selected.reviews > 20 ||
                      selected.leaseCount > 20) && (
                      <small>显示最近 20 条，可前往详情页继续查看。</small>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="inspector-icon" aria-hidden="true">
                  ◎
                </span>
                <h3>每个气泡，都是一位助手。</h3>
                <p>点击看看它来自哪里，正在负责什么。</p>
              </>
            )}
          </section>
        </div>
      </div>
      <section className="orbit-panel orbit-progress">
        <div className="orbit-progress-heading">
          <h2>最新进展</h2>
          <button className="orbit-link" onClick={() => onNavigate("Tasks")}>
            探索任务 ↗
          </button>
        </div>
        <p className="summary-text">
          {project.summary || "议题已就绪，等待新的探索与发现。"}
        </p>
        {latest.length > 0 && (
          <div className="orbit-findings">
            {latest.map((f) => (
              <button
                key={f.id}
                className="orbit-finding"
                onClick={() => onFinding(f.id)}
              >
                <span
                  className={
                    f.status === "verified"
                      ? "finding-light accepted"
                      : "finding-light"
                  }
                />
                <span>
                  {f.title}
                  <em className="finding-author">
                    {project.agents.find((a: RecordItem) => a.id === f.agentId)
                      ?.name || "项目协作者"}{" "}
                    提交
                  </em>
                </span>
                <small>
                  {(
                    {
                      verified: "已确认",
                      proposed: "待验证",
                      disputed: "有争议",
                      rejected: "未通过",
                    } as Record<string, string>
                  )[f.status] || f.status}{" "}
                  ↗
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
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
