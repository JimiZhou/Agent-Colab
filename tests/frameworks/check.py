"""Real framework adapters against a running test server; no inference/model keys."""
import asyncio
import json
import os
import uuid
from importlib.metadata import version

import httpx
from agents.mcp import MCPServerStreamableHttp
from langchain_mcp_adapters.client import MultiServerMCPClient


async def main():
    base = os.environ.get("BASE_URL", "http://127.0.0.1:8798")
    admin = os.environ["ADMIN_TOKEN"]
    async with httpx.AsyncClient(base_url=base) as http:
        async def post(path, body, token=admin):
            response = await http.post(path, json=body, headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": str(uuid.uuid4())})
            response.raise_for_status()
            return response.json()

        for attempt in range(50):
            try:
                health = await http.get("/health")
                if health.is_success:
                    break
            except httpx.TransportError:
                pass
            await asyncio.sleep(0.2)
        else:
            raise RuntimeError("Test server did not become healthy")

        project = await post("/api/projects", {"name": "Framework interoperability", "goal": "Share real findings across adapters"})
        project_id = project["id"]
        first = await post(f"/api/projects/{project_id}/join", {"name": "OpenAI adapter", "participantName": "Researcher A"})
        second = await post(f"/api/projects/{project_id}/join", {"name": "LangChain adapter", "participantName": "Researcher B"})
        task = await post(f"/api/projects/{project_id}/tasks", {"title": "Adapter interoperability"}, first["token"])
        async with MCPServerStreamableHttp(params={"url": base + "/mcp", "headers": {"Authorization": f"Bearer {first['token']}"}}) as server:
            tools = await server.list_tools()
            assert len(tools) == 11
            context = await server.call_tool("get_project_context", {"projectId": project_id})
            assert not context.isError
            claim = await server.call_tool("claim_task", {"projectId": project_id, "taskId": task["id"], "idempotencyKey": str(uuid.uuid4())})
            assert not claim.isError
            finding = await server.call_tool("submit_finding", {"projectId": project_id, "taskId": task["id"], "idempotencyKey": str(uuid.uuid4()), "title": "Real framework adapter result", "summary": "Two adapters share durable context", "direction": "Interoperability", "method": "MCP tool invocation", "evidence": [{"description": "OpenAI Agents SDK successfully called scoped MCP tools"}], "reproduction": "Run tests/frameworks/check.py against a running server"})
            assert not finding.isError
        client = MultiServerMCPClient({"colab": {"transport": "streamable_http", "url": base + "/mcp", "headers": {"Authorization": f"Bearer {second['token']}"}}})
        tools = {tool.name: tool for tool in await client.get_tools()}
        assert len(tools) == 11
        result = await tools["list_findings"].ainvoke({"projectId": project_id})
        assert "Real framework adapter result" in str(result)
        event_result = await tools["get_recent_events"].ainvoke({"projectId": project_id, "after": 0})
        assert "finding.submitted" in str(event_result)
        print(json.dumps({"openai-agents": version("openai-agents"), "langchain-mcp-adapters": version("langchain-mcp-adapters"), "result": "PASS: tool discovery, context, claim, finding submission and cross-framework event/finding reads", "inference": "not invoked"}))


asyncio.run(main())
