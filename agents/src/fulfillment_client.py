"""Thin wrapper around the Node backend's existing admin API. No direct database access from
Python anywhere in this service — every read/write goes through the same endpoints
FulfillmentBoard.jsx and FrontDeskAlerts.jsx already use, authenticated the same way (the
X-Admin-Key header, same value as backend/.env's ADMIN_API_KEY)."""

import requests

from . import config

DEPARTMENTS = ["kitchen", "housekeeping", "spa", "library"]

_HEADERS = {"X-Admin-Key": config.ADMIN_API_KEY, "Content-Type": "application/json"}
_TIMEOUT = 15


def get_pending_tickets(department: str) -> list[dict]:
    """Only tickets staff hasn't started on yet, and that haven't already been triaged —
    keeps a run from reprocessing (and re-billing an LLM call for) the same ticket every
    RUN_INTERVAL_SECONDS. Staff moving a ticket to in_progress/completed, or the ticket
    already having a priority, both exclude it here."""
    url = f"{config.NODE_ADMIN_BASE_URL}/fulfillment/{department}"
    response = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
    response.raise_for_status()
    tickets = response.json()["tickets"]
    return [t for t in tickets if t["status"] == "pending" and not t.get("priority")]


def update_ticket(department: str, ticket_id: str, priority: str, note: str) -> None:
    url = f"{config.NODE_ADMIN_BASE_URL}/fulfillment/{department}/{ticket_id}"
    response = requests.patch(
        url, headers=_HEADERS, json={"priority": priority, "agentNote": note}, timeout=_TIMEOUT
    )
    response.raise_for_status()


def get_pending_alerts() -> list[dict]:
    url = f"{config.NODE_ADMIN_BASE_URL}/front-desk-alerts"
    response = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
    response.raise_for_status()
    alerts = response.json()["alerts"]
    return [a for a in alerts if a["status"] == "open" and not a.get("agentNote")]


def update_alert(alert_id: str, note: str, urgency: str | None = None) -> None:
    payload: dict = {"agentNote": note}
    if urgency:
        payload["urgency"] = urgency
    url = f"{config.NODE_ADMIN_BASE_URL}/front-desk-alerts/{alert_id}"
    response = requests.patch(url, headers=_HEADERS, json=payload, timeout=_TIMEOUT)
    response.raise_for_status()
