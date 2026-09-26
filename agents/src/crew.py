import logging

from crewai import Crew, Process

from . import tasks

logger = logging.getLogger(__name__)


def run_once() -> dict:
    """Fetches current pending work, triages whatever exists, and returns a small summary of
    what happened. Safe to call with nothing pending — just does nothing and says so."""
    task_list = tasks.build_tasks()
    if not task_list:
        logger.info("No pending tickets/alerts to triage.")
        return {"ran": False, "message": "Nothing pending to triage.", "summary": None}

    agent_list = list(
        {
            *(t.agent for t in task_list),
        }
    )

    crew = Crew(agents=agent_list, tasks=task_list, process=Process.sequential, verbose=True)
    result = crew.kickoff()

    logger.info("Crew run complete: %s", result)
    return {"ran": True, "message": f"Triaged {len(task_list) - 1} department(s).", "summary": str(result)}
