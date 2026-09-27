import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from openai import RateLimitError

from . import config, crew

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Guards against an on-demand /run overlapping with the background loop's own run — CrewAI's
# kickoff() is synchronous/blocking, so both would otherwise be free to fire at once and
# double-triage the same tickets in a race.
_run_lock = asyncio.Lock()

# There's no external monitoring/alerting wired up for this service (no Sentry/uptime-check
# account etc. configured) — this in-memory state is the only way to tell "is this actually
# working" without reading raw logs, and /status below exposes it so a human or a future admin
# panel button can check at a glance instead of tailing stdout.
FAILURE_ALERT_THRESHOLD = 3
_state = {
    "started_at": None,
    "last_run_at": None,
    # "triaged" | "nothing_pending" | "rate_limited" | "error" | "skipped_concurrent"
    "last_run_result": None,
    "last_message": None,
    "consecutive_failures": 0,
    "total_runs": 0,
    "total_failures": 0,
}


def _record(result: str, message: str) -> None:
    _state["last_run_at"] = datetime.now(timezone.utc).isoformat()
    _state["last_run_result"] = result
    _state["last_message"] = message
    _state["total_runs"] += 1
    if result == "error":
        _state["consecutive_failures"] += 1
        _state["total_failures"] += 1
        if _state["consecutive_failures"] >= FAILURE_ALERT_THRESHOLD:
            # Deliberately loud/greppable — the closest thing to an alert without a real
            # alerting service wired up. If this line ever shows up, something has been
            # silently broken for a while and tickets are piling up untriaged.
            logger.error(
                "ALERT: %s consecutive triage run failures — tickets are not being triaged.",
                _state["consecutive_failures"],
            )
    else:
        _state["consecutive_failures"] = 0


async def _run_once_locked() -> dict:
    if _run_lock.locked():
        _record("skipped_concurrent", "A run is already in progress.")
        return {"ran": False, "message": "A run is already in progress.", "summary": None}
    async with _run_lock:
        try:
            result = await run_in_threadpool(crew.run_once)
            _record("triaged" if result["ran"] else "nothing_pending", result["message"])
            return result
        except RateLimitError as err:
            # Groq's free tier — surfaces as a clean, expected message rather than a raw 500.
            # A run failing partway through is safe: each tool call writes its ticket's
            # priority/note immediately (not batched at the end), and get_pending_tickets()
            # only ever asks for tickets still missing a priority, so whatever succeeded
            # before the failure stays triaged and the rest gets picked up next run.
            logger.warning("Groq rate limit hit during triage run: %s", err)
            message = "Groq rate limit reached — this run will be retried on the next scheduled pass."
            _record("rate_limited", message)
            return {"ran": False, "message": message, "summary": None}
        except Exception:
            logger.exception("Triage run failed")
            message = "Triage run failed — see agents service logs for details."
            _record("error", message)
            return {"ran": False, "message": message, "summary": None}


async def _background_loop():
    while True:
        await asyncio.sleep(config.RUN_INTERVAL_SECONDS)
        try:
            result = await _run_once_locked()
            logger.info("Scheduled run: %s", result["message"])
        except Exception:
            logger.exception("Scheduled triage run failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _state["started_at"] = datetime.now(timezone.utc).isoformat()
    task = asyncio.create_task(_background_loop())
    logger.info("Background triage loop started (every %ss).", config.RUN_INTERVAL_SECONDS)
    yield
    task.cancel()


app = FastAPI(title="Hotel Ops Crew", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    """Real operational status, not just liveness — whether triage runs are actually
    succeeding. `healthy: false` means recent runs have been failing outright (not just
    finding nothing to do, and not a transient rate limit)."""
    return {**_state, "healthy": _state["consecutive_failures"] < FAILURE_ALERT_THRESHOLD}


@app.post("/run")
async def run_now():
    """On-demand trigger — for a demo, or later an admin panel button."""
    return await _run_once_locked()
