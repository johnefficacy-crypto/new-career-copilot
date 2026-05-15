"""Study OS Mission Control (PR3).

Deterministic read/composition layer that combines the PR1 persona
snapshot, PR2 tiny-question selector, and the existing Study OS
endpoints (plan, focus summary, weekly review) into a single
``/api/study/mission-control`` response.

PR3 does NOT:
- generate new tasks,
- claim exam / PYQ / update intelligence,
- expose internal persona labels as user-facing identity copy,
- shame the user for missed/skipped tasks,
- call any AI.
"""

from app.study_os.mission_control import (  # noqa: F401
    build_mission_control,
    build_task_reasoning_response,
)
from app.study_os.task_reasoning import (  # noqa: F401
    build_task_reasoning,
    build_task_reasoning_detail,
)
