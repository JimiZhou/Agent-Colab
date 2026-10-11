import { useState } from "react";
export function ConnectionGuide({
  projectId,
  endpoint,
  instruction,
}: {
  projectId: string;
  endpoint: string;
  instruction: string;
}) {
  const [client, setClient] = useState("Codex");
  const [copied, setCopied] = useState(false);
  const origin = new URL(endpoint, location.origin).origin;
  const pythonBase = `import os\nTOKEN = os.environ["AGENT_COLAB_TOKEN"]\nPROJECT = ${JSON.stringify(projectId)}\n`;
  const configs: Record<string, { note: string; code: string }> = {
    Codex: {
      note: "在本机 Codex 配置中添加下方内容。启动 Codex 前，安全设置 AGENT_COLAB_TOKEN 环境变量。",
      code: `[mcp_servers.agent_colab]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = "AGENT_COLAB_TOKEN"`,
    },
    "Claude Code": {
      note: "设置 AGENT_COLAB_TOKEN 后执行此命令，再用 /mcp 检查连接。单引号保留环境变量引用。",
      code: `claude mcp add-json --scope local agent-colab '${JSON.stringify({ type: "http", url: endpoint, headers: { Authorization: "Bearer ${AGENT_COLAB_TOKEN}" } }).replace(/'/g, "'\\''")}'`,
    },
    Cursor: {
      note: "添加到本机 MCP 配置。Cursor 使用 ${env:变量名} 读取环境变量；请在启动前安全设置凭证。",
      code: JSON.stringify(
        {
          mcpServers: {
            "agent-colab": {
              url: endpoint,
              headers: { Authorization: "Bearer ${env:AGENT_COLAB_TOKEN}" },
            },
          },
        },
        null,
        2,
      ),
    },
    "VS Code": {
      note: "添加到 MCP 配置。连接时通过密码输入框提供凭证；不要将实际凭证写入文件。",
      code: JSON.stringify(
        {
          inputs: [
            {
              type: "promptString",
              id: "agentColabToken",
              description: "Agent-Colab project credential",
              password: true,
            },
          ],
          servers: {
            "agent-colab": {
              type: "http",
              url: endpoint,
              headers: { Authorization: "Bearer ${input:agentColabToken}" },
            },
          },
        },
        null,
        2,
      ),
    },
    "OpenAI Agents SDK": {
      note: "Python：安装 openai-agents。在 async 函数中连接；无需模型 API 即可读取与调用 MCP 工具。",
      code:
        pythonBase +
        `from agents.mcp import MCPServerStreamableHttp\n\nasync with MCPServerStreamableHttp(params={\n    "url": ${JSON.stringify(endpoint)},\n    "headers": {"Authorization": f"Bearer {TOKEN}"}\n}) as server:\n    context = await server.call_tool("get_project_context", {"projectId": PROJECT})\n    # Attach server to your Agent via mcp_servers=[server].`,
    },
    "LangChain / LangGraph": {
      note: "Python：安装 langchain-mcp-adapters，将返回的 tools 交给自己的 Agent 或 LangGraph 工作流。",
      code:
        pythonBase +
        `from langchain_mcp_adapters.client import MultiServerMCPClient\n\nclient = MultiServerMCPClient({"colab": {\n    "transport": "streamable_http",\n    "url": ${JSON.stringify(endpoint)},\n    "headers": {"Authorization": f"Bearer {TOKEN}"}\n}})\ntools = await client.get_tools()\ncontext_tool = next(t for t in tools if t.name == "get_project_context")\ncontext = await context_tool.ainvoke({"projectId": PROJECT})`,
    },
    "本地 stdio": {
      note: "用于需要本地进程或资源订阅的客户端。先克隆仓库并运行 npm ci、npm run build。以下是 Codex 配置示例，修改绝对路径；其他客户端配置同一个 node 进程并显式传入这三个环境变量。",
      code: `[mcp_servers.agent_colab]\ncommand = "node"\nargs = ["/ABSOLUTE/PATH/Agent-Colab/dist/scripts/mcp-stdio.js"]\nenv_vars = ["AGENT_COLAB_TOKEN"]\n[mcp_servers.agent_colab.env]\nAGENT_COLAB_URL = ${JSON.stringify(origin)}\nAGENT_COLAB_PROJECT = ${JSON.stringify(projectId)}`,
    },
  };
  return (
    <section className="card connection-guide">
      <h2>连接你的 AI 助手</h2>
      <label htmlFor="harness-choice">你使用的是</label>
      <select
        id="harness-choice"
        value={client}
        onChange={(e) => {
          setClient(e.target.value);
          setCopied(false);
        }}
      >
        {Object.keys(configs).map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <p>{configs[client].note}</p>
      <pre>{configs[client].code}</pre>
      <h3>连接后，把这段指令交给助手</h3>
      <pre>{instruction || "正在获取项目接入指令…"}</pre>
      <button
        disabled={!instruction}
        onClick={() =>
          void navigator.clipboard
            .writeText(instruction)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "已复制" : "复制加入指令"}
      </button>
      <p className="muted">
        已实测标准 MCP HTTP、stdio
        和资源通知。各客户端是否自动响应通知取决于自身能力；没有订阅时，在工作期间每
        30 秒及重要操作前读取最新事件。
      </p>
      <details>
        <summary>协议与同步详情</summary>
        <p>MCP Streamable HTTP</p>
        <code>{endpoint}</code>
        <p>
          事件流：
          <code>
            {origin}/api/projects/{projectId}/events/stream
          </code>
        </p>
        <p>
          使用 Authorization 请求头；断线后带 Last-Event-ID
          恢复。服务端约每秒检查新事件。HTTP MCP 使用 get_recent_events
          增量读取，stdio 客户端可订阅资源更新。
        </p>
        <p>
          Codex、Claude Code、Cursor、VS Code
          配置依据官方文档；此处不宣称已运行它们的模型会话。
        </p>
        <a href="/skill.md" target="_blank" rel="noreferrer">
          Agent 协作说明 ↗
        </a>
      </details>
    </section>
  );
}
