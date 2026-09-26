from datetime import datetime, timezone

from crewai import Task

from . import agents, fulfillment_client as fc

_RESTATE_OUTPUT = (
    "After calling the triage tool once per ticket listed, restate for each one: its id, the "
    "priority you assigned, and the note you gave. This is required even though the tool call "
    "already recorded it, so the shift manager's summary (built from your answer, not the raw "
    "tool calls) is grounded in what you actually decided."
)

_DEPARTMENTS = [
    ("kitchen", agents.kitchen_agent, "kitchen/food"),
    ("housekeeping", agents.housekeeping_agent, "housekeeping"),
    ("spa", agents.spa_agent, "spa"),
    ("library", agents.library_agent, "library"),
]


def _age_minutes(created_at: str) -> int:
    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return max(0, int((datetime.now(timezone.utc) - created).total_seconds() // 60))


def _format_ticket(t: dict) -> str:
    age_min = _age_minutes(t["createdAt"])
    return f"- id={t['id']}, item={t['itemName']}, qty={t['quantity']}, room={t.get('roomNumber') or 'n/a'}, waiting ~{age_min} min"


def _format_alert(a: dict) -> str:
    age_min = _age_minutes(a["createdAt"])
    return f"- id={a['id']}, issue=\"{a['issue']}\", room={a.get('roomNumber') or 'n/a'}, urgency={a['urgency']}, open ~{age_min} min"


def build_tasks() -> list[Task]:
    """Fetches current pending work from the Node admin API and builds one Task per
    department that actually has something to triage (skipping empty departments avoids
    wasting an LLM call), plus a final manager summary task if anything was triaged."""
    department_tasks: list[Task] = []

    for department, agent, label in _DEPARTMENTS:
        tickets = fc.get_pending_tickets(department)
        if not tickets:
            continue
        ticket_lines = "\n".join(_format_ticket(t) for t in tickets)
        department_tasks.append(
            Task(
                description=(
                    f"Here are the pending {label} tickets that need triage:\n{ticket_lines}\n\n"
                    "For EACH ticket listed, call your triage tool exactly once with a priority "
                    "(low/normal/high/urgent) and a one-sentence note. Judge priority from wait "
                    "time and quantity — a large order or long wait deserves higher priority "
                    "than something small and just placed."
                ),
                expected_output=_RESTATE_OUTPUT,
                agent=agent,
            )
        )

    alerts = fc.get_pending_alerts()
    if alerts:
        alert_lines = "\n".join(_format_alert(a) for a in alerts)
        department_tasks.append(
            Task(
                description=(
                    f"Here are the open front-desk alerts that need triage:\n{alert_lines}\n\n"
                    "For EACH alert listed, call your triage tool exactly once with a short note. "
                    "Set upgrade_to_urgent=True only if the issue looks more serious than its "
                    "current urgency suggests (e.g. a safety concern flagged as normal)."
                ),
                expected_output=(
                    "After calling the triage tool once per alert listed, restate for each one: "
                    "its id, whether you upgraded it to urgent, and the note you gave."
                ),
                agent=agents.front_desk_agent,
            )
        )

    if not department_tasks:
        return []

    summary_task = Task(
        description=(
            "Given the triage results from the previous tasks, write a short cross-department "
            "summary for the shift manager. Call out anything high or urgent priority by name. "
            "If nothing is high/urgent, say so plainly. Do not invent details not present in "
            "the previous tasks' own results."
        ),
        expected_output="A short (3-5 sentence) factually grounded ops summary.",
        agent=agents.manager_agent,
        context=department_tasks,
    )
    department_tasks.append(summary_task)
    return department_tasks
