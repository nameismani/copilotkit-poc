import os
from langchain_groq import ChatGroq
from copilotkit import CopilotKitState


def get_llm(temperature: float = 0.3) -> ChatGroq:
    return ChatGroq(model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), temperature=temperature)


def context_text(state: CopilotKitState) -> str:
    """App context from the frontend (useAgentContext) as prompt text."""
    ctx = (state.get("copilotkit") or {}).get("context") or []
    parts = []
    for item in ctx:
        if isinstance(item, dict):
            desc, val = item.get("description", ""), item.get("value", "")
        else:
            desc, val = getattr(item, "description", ""), getattr(item, "value", "")
        parts.append(f"{desc}:\n{val}")
    return "\n\n".join(parts) if parts else "(no app context provided)"


def frontend_tools(state: CopilotKitState) -> list:
    return (state.get("copilotkit") or {}).get("actions") or state.get("tools") or []

def tool_names(tools: list) -> list[str]:
    return [t.get("name") or t.get("function", {}).get("name") for t in tools if isinstance(t, dict)]