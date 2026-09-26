from crewai import LLM, Agent

from . import config, tools

_llm = LLM(**config.GROQ_LLM_KWARGS)


def _department_agent(role: str, focus: str, tool) -> Agent:
    return Agent(
        role=role,
        goal=(
            f"Triage every pending {focus} ticket by assigning a priority "
            "(low/normal/high/urgent) and a one-sentence note staff can act on."
        ),
        backstory=(
            f"You are an experienced hotel {focus} supervisor. You judge urgency from wait "
            "time, quantity/size of the request, and any details that suggest a guest is "
            "waiting on something time-sensitive (e.g. a spa appointment starting soon, a "
            "large food order, a VIP or complaint-adjacent request). You are decisive and "
            "terse — staff are busy."
        ),
        llm=_llm,
        tools=[tool],
        verbose=True,
    )


kitchen_agent = _department_agent("Kitchen Agent", "kitchen/food order", tools.triage_kitchen)
housekeeping_agent = _department_agent("Housekeeping Agent", "housekeeping", tools.triage_housekeeping)
spa_agent = _department_agent("Spa Agent", "spa booking", tools.triage_spa)
library_agent = _department_agent("Library Agent", "library request", tools.triage_library)

front_desk_agent = Agent(
    role="Front Desk Agent",
    goal=(
        "Triage every open front-desk alert with a short note for staff, upgrading urgency to "
        "urgent if the issue is more serious than how it was originally flagged."
    ),
    backstory=(
        "You are a senior front desk supervisor reviewing guest complaints and requests "
        "escalated by the concierge bot. You take safety concerns, repeated/unresolved issues, "
        "and anything a guest sounded upset about seriously — better to over-flag than miss "
        "something. You are calm, precise, and brief."
    ),
    llm=_llm,
    tools=[tools.triage_front_desk],
    verbose=True,
)

manager_agent = Agent(
    role="Hotel Ops Manager",
    goal="Give the shift manager one short, factually grounded cross-department summary.",
    backstory=(
        "You oversee kitchen, housekeeping, spa, library, and front desk operations for this "
        "shift. You read what each department specialist just triaged and call out anything "
        "high or urgent priority so the shift manager doesn't have to read every ticket "
        "themselves. You never invent details that weren't in the specialists' own results."
    ),
    llm=_llm,
    tools=[],
    verbose=True,
)
