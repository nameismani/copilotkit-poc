from typing import Any
from datetime import date

from langchain_core.messages import SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from copilotkit import CopilotKitState

from common import get_llm, context_text, frontend_tools
from money_agent import ask_money_manager

# Backend tools run here in Python. Anything else the model calls is a BROWSER tool.
BACKEND_TOOLS = {ask_money_manager.name: ask_money_manager}


class MainState(CopilotKitState):
    pass


async def supervisor(state: MainState, config: RunnableConfig) -> dict[str, Any]:
    ui_tools = frontend_tools(state)
    print("[supervisor] browser tools:", [t.get("name") or t.get("function", {}).get("name") for t in ui_tools if isinstance(t, dict)])

    # parallel_tool_calls=False -> at most ONE tool call per model step, so a message never mixes
    # a browser tool with a backend tool. If Groq rejects this argument, delete it (the router
    # below still protects the history).
    model = get_llm().bind_tools([*ui_tools, *BACKEND_TOOLS.values()], parallel_tool_calls=False)

    system = SystemMessage(content=f"""You are a friendly assistant for an app with two areas. Today is {date.today().isoformat()}.

1) TODO LIST (lives in the user's browser)
   - Change it only with the browser tools: add_todo, edit_todo, delete_todo, toggle_todo.
   - Questions about the todo list (count, which are done) are answered from the APP CONTEXT below. No tool needed.
   - Take todo ids from the context. Never invent ids.

2) MONEY (income, expenses, balance, spending)
   - For ANY money request call ask_money_manager with a complete, self-contained task.
   - Never answer money data from memory. Relay the specialist's numbers accurately.

Rules:
- Make ONE tool call per step. If the user asks for both areas, do the money part first, wait for its result, then do the todo part.
- Before your final reply, check that EVERY part of the user's request was handled.
- Other questions: just chat normally. After tools finish, confirm briefly.

=== APP CONTEXT (live from the UI) ===
{context_text(state)}
""")
    response = await model.ainvoke([system, *state["messages"]], config)
    return {"messages": [response]}


async def tools_node(state: MainState) -> dict[str, Any]:
    """Runs backend tool calls. Browser calls found in the same message get a 'skipped' result
    so every tool_call has an answer (the model re-issues them alone in the next step)."""
    out = []
    for call in state["messages"][-1].tool_calls:
        tool = BACKEND_TOOLS.get(call["name"])
        if tool:
            try:
                content = str(await tool.ainvoke(call["args"]))
            except Exception as e:
                content = f"Error: {e}"
        else:
            content = "Not executed: call UI tools alone, in a separate step after backend tools finish."
        out.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
    return {"messages": out}


def route(state: MainState):
    calls = getattr(state["messages"][-1], "tool_calls", None) or []
    if not calls:
        return END
    if any(c["name"] in BACKEND_TOOLS for c in calls):
        return "tools"   # run backend work, then come back to the supervisor
    return END           # only browser tools: end the run so the browser executes them


workflow = StateGraph(MainState)
workflow.add_node("supervisor", supervisor)
workflow.add_node("tools", tools_node)
workflow.set_entry_point("supervisor")
workflow.add_conditional_edges("supervisor", route, {"tools": "tools", END: END})
workflow.add_edge("tools", "supervisor")

main_graph = workflow.compile(checkpointer=MemorySaver())