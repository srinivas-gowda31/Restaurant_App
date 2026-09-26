import os

from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
AGENT_MODEL = os.environ.get("AGENT_MODEL", "openai/gpt-oss-120b")
NODE_ADMIN_BASE_URL = os.environ.get("NODE_ADMIN_BASE_URL", "http://localhost:4000/api/admin")
ADMIN_API_KEY = os.environ["ADMIN_API_KEY"]
RUN_INTERVAL_SECONDS = int(os.environ.get("RUN_INTERVAL_SECONDS", "120"))

# Groq is reached through CrewAI's native OpenAI-compatible LLM client, not LiteLLM (not a
# dependency here) — confirmed working directly against this project's actual Groq account.
# One subtlety that cost real debugging time: pass model/provider like this, NOT
# model="openai/gpt-oss-120b" with custom_openai=True. CrewAI's custom_openai path treats an
# "openai/" prefix as its own routing syntax and strips it before sending the request — but
# Groq's real model id for this model literally starts with "openai/" (that's the vendor
# string baked into the id, not a CrewAI routing prefix), so stripping it sends a bare
# "gpt-oss-120b" to Groq, which 404s. Passing provider="openai" explicitly instead takes a
# different code path in crewai/llm.py that uses the model string verbatim.
GROQ_LLM_KWARGS = {
    "model": AGENT_MODEL,
    "provider": "openai",
    "base_url": "https://api.groq.com/openai/v1",
    "api_key": GROQ_API_KEY,
}
