# Hotel Ops Crew (CrewAI)

A back-of-house multi-agent system, separate from the guest-facing chat/voice bot (that stays
exactly as it is — Node/Gemini/Azure, untouched by this service). This is a small Python
service that periodically reviews pending kitchen tickets, housekeeping requests, spa
bookings, library requests, and front-desk alerts, and triages each one with a priority and a
short note for staff — visible in the existing admin panel (Fulfillment / Front Desk tabs).

6 agents: one specialist per department (Kitchen, Housekeeping, Spa, Library, Front Desk) plus
an Ops Manager agent that writes a short cross-department summary once the specialists are done.

No direct database access from this service — every read/write goes through the Node backend's
existing admin API (`backend/src/routes/admin.js`), authenticated with the same `ADMIN_API_KEY`
the admin panel frontend already uses.

## Setup

Requires Python 3.10–3.13 (**not 3.14** — CrewAI doesn't support it yet as of this writing; if
only 3.14 is installed, get a compatible version via [uv](https://docs.astral.sh/uv/):
`uv python install 3.12`, then `uv venv --python 3.12 .venv`).

```
cd agents
python -m venv .venv          # or: uv venv --python 3.12 .venv
.venv\Scripts\activate         # Windows
pip install -r requirements.txt
copy .env.example .env         # then fill in real values — GROQ_API_KEY and ADMIN_API_KEY
                                # can be copied straight from backend/.env
```

## Run

The Node backend must already be running (`cd ../backend && npm run dev`) — this service calls
its admin API.

```
uvicorn src.server:app --reload --port 8001
```

- Triages automatically every `RUN_INTERVAL_SECONDS` (default 120s) in the background.
- `POST http://localhost:8001/run` — trigger a run on demand (handy for a demo, or wiring up an
  admin panel button later).
- `GET http://localhost:8001/health` — liveness check.

Re-running never reprocesses a ticket that already has a priority — only ones still
`status: "pending"` with no priority set are picked up, so it's safe to trigger `/run` as often
as you like.

## Notes for future changes

- **Model availability**: `AGENT_MODEL` (`openai/gpt-oss-120b` by default) is a Groq-hosted
  model — Groq's lineup changes often. If everything starts 404ing, check
  https://console.groq.com/docs/models for what's currently live and update `.env`.
- **Why `provider="openai"` instead of the more common `model="openai/gpt-oss-120b",
  custom_openai=True`**: see the comment in `src/config.py` — the shorter form silently strips
  the `openai/` prefix before sending the request, which breaks here because that prefix is
  part of Groq's actual model id, not a CrewAI routing hint.
- **Why `Process.sequential`, not `Process.hierarchical`**: tested both directly. Hierarchical
  delegation showed a real cross-department mix-up in testing (one agent's tool got called with
  another department's ticket data) — not worth the risk when routing is already deterministic
  (a kitchen ticket only ever needs the kitchen agent, no judgment call required). The Ops
  Manager agent still exists, just for a final summary task instead of delegation.
