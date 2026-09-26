import asyncio
import logging
from contextlib import asynccontextmanager

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


async def _run_once_locked() -> dict:
    if _run_lock.locked():
        return {"ran": False, "message": "A run is already in progress.", "summary": None}
    async with _run_lock:
        try:
            return await run_in_threadpool(crew.run_once)
        except RateLimitError as err:
            # Groq's free tier — surfaces as a clean, expected message rather than a raw 500.
            # A run failing partway through is safe: each tool call writes its ticket's
            # priority/note immediately (not batched at the end), and get_pending_tickets()
            # only ever asks for tickets still missing a priority, so whatever succeeded
            # before the failure stays triaged and the rest gets picked up next run.
            logger.warning("Groq rate limit hit during triage run: %s", err)
            return {
                "ran": False,
                "message": "Groq rate limit reached — this run will be retried on the next scheduled pass.",
                "summary": None,
            }
        except Exception:
            logger.exception("Triage run failed")
            return {"ran": False, "message": "Triage run failed — see agents service logs for details.", "summary": None}


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
    task = asyncio.create_task(_background_loop())
    logger.info("Background triage loop started (every %ss).", config.RUN_INTERVAL_SECONDS)
    yield
    task.cancel()


app = FastAPI(title="Hotel Ops Crew", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/run")
async def run_now():
    """On-demand trigger — for a demo, or later an admin panel button."""
    return await _run_once_locked()
