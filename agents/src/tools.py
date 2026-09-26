"""One tool per department, each wired to only that department's fulfillment_client call —
giving a department agent write access to a different department's tickets isn't possible
even if the model gets confused, since the tool itself is hardcoded to one department."""

from crewai.tools import tool

from . import fulfillment_client as fc


def _make_triage_tool(department: str):
    @tool(f"Record triage for a {department} ticket")
    def _triage(ticket_id: str, priority: str, note: str) -> str:
        """Record the priority and a short note for one ticket in this department.
        priority must be exactly one of: low, normal, high, urgent."""
        fc.update_ticket(department, ticket_id, priority, note)
        return f"Recorded priority={priority} for {department} ticket {ticket_id}."

    _triage.name = f"triage_{department}_ticket"
    return _triage


triage_kitchen = _make_triage_tool("kitchen")
triage_housekeeping = _make_triage_tool("housekeeping")
triage_spa = _make_triage_tool("spa")
triage_library = _make_triage_tool("library")


@tool("Record triage for a front desk alert")
def triage_front_desk(alert_id: str, note: str, upgrade_to_urgent: bool = False) -> str:
    """Record a short triage note for one front desk alert, and optionally upgrade its
    urgency to "urgent" if the issue looks more serious than how the guest-facing bot
    originally flagged it (e.g. a safety concern, or a complaint that's gone unresolved)."""
    fc.update_alert(alert_id, note, urgency="urgent" if upgrade_to_urgent else None)
    return f"Recorded note for alert {alert_id}" + (" and upgraded to urgent." if upgrade_to_urgent else ".")
