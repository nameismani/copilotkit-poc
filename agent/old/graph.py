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


async def chat_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    model = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2)

    # Bind the frontend actions (add/edit/delete/toggle) as tools
    frontend_tools = state.get("copilotkit", {}).get("actions", [])
    model_with_tools = model.bind_tools(frontend_tools)

    system = SystemMessage(content=(
        "You are a todo assistant. You manage the user's todo list ONLY by calling the "
        "provided tools (add_todo, edit_todo, delete_todo, toggle_todo). "
        "Use the todo list context (with ids) to find the right task. "
        "Never invent ids. Keep replies short."
    ))

    response = await model_with_tools.ainvoke([system, *state["messages"]], config)
    return {"messages": [response]}


workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.set_entry_point("chat_node")
workflow.add_edge("chat_node", END)

graph = workflow.compile(checkpointer=MemorySaver())