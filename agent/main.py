import os
from dotenv import load_dotenv
load_dotenv()

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent

from graph_main import main_graph
from money_api import router as money_router

app = FastAPI()

# Browser calls the REST API directly (React Query), so allow the Next.js origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(money_router)

add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="main_assistant",
        description="Supervisor: todo list (browser tools) + money manager (sub-agent).",
        graph=main_graph,
    ),
    path="/copilotkit",
)

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    # reload=False on purpose: auto-reload restarts the process and WIPES the in-memory dict
    # every time you save a .py file. Use RELOAD=1 only when you accept that.
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")),
                reload=os.getenv("RELOAD") == "1")