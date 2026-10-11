from typing import Any
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from copilotkit import CopilotKitState


class AgentState(CopilotKitState):
    # CopilotKitState already provides `messages` and `copilotkit` (frontend actions)
    pass


def _context_text(state: AgentState) -> str:
    """Turn app context from the frontend (useAgentContext) into prompt text."""
    ctx = (state.get("copilotkit") or {}).get("context") or []
    parts = []
    for item in ctx:
        if isinstance(item, dict):
            desc, val = item.get("description", ""), item.get("value", "")
        else:
            desc, val = getattr(item, "description", ""), getattr(item, "value", "")
        parts.append(f"{desc}:\n{val}")
    return "\n\n".join(parts) if parts else "(no app context provided)"


async def chat_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    model = ChatGroq(model="openai/gpt-oss-120b", temperature=0.3)

    # Frontend tools registered with useFrontendTool
    tools = (state.get("copilotkit") or {}).get("actions") or state.get("tools") or []
    print("Frontend tools:", [t.get("name") or t.get("function", {}).get("name") for t in tools if isinstance(t, dict)])
    model_with_tools = model.bind_tools(tools) if tools else model

    system = SystemMessage(content=f"""You are a friendly, helpful AI assistant inside a todo app.

How to behave:
- Chat normally. Answer general questions (facts, advice, explanations, small talk) like any good assistant.
- Questions ABOUT the todo list (how many, which are done or pending, details) must be answered from the app context below. Do NOT call a tool for these.
- Call a tool ONLY when the user asks to change the list: add, edit, delete, or mark done or not done.
- Always take ids from the app context. Never invent an id.
- After using a tool, confirm briefly in plain language what you did.
- Use short markdown (lists are fine) when listing todos.

=== APP CONTEXT (live from the UI) ===
{_context_text(state)}
""")

    response = await model_with_tools.ainvoke([system, *state["messages"]], config)
    return {"messages": [response]}


workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.set_entry_point("chat_node")
workflow.add_edge("chat_node", END)

graph = workflow.compile(checkpointer=MemorySaver())