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

from app.study_os.mission_control import build_mission_control  # noqa: F401
from app.study_os.task_reasoning import build_task_reasoning  # noqa: F401
