# CutSteward design source of truth

These references define one restrained visual system: studio black, warm-white
type, large optical spacing, and a small number of functional Liquid Glass
surfaces. The implementation should preserve hierarchy and interaction intent,
not rasterize UI text or copy incidental image-generation artifacts.

1. `cutsteward-home.png` — English-first new-project command surface.
2. `cutsteward-production-cockpit.png` — live Director plan, storyboard, and agent state.
3. `cutsteward-plan-approval.png` — exact local plan approval with explicit guardrails.
4. `cutsteward-final-review.png` — truthful sample master review and evidence state.
5. `cutsteward-certified-delivery.png` — certified-delivery presentation.
6. `cutsteward-recent-runs.png` — local run history and recovery.
7. `cutsteward-runner-device.png` — runner, device health, and safe fallback.
8. `cutsteward-mobile-cockpit.png` — responsive portrait production cockpit.

These are fresh local captures of the current CutSteward build. The legacy
FramePilot-named captures are intentionally ignored and are not part of the
public release candidate.

## Product rules

- Keep the film or current decision visually dominant.
- Prefer one continuous surface and divided rows over dashboards or card grids.
- Use sheets for sources, runner selection, activity, approvals, and recovery.
- Never claim a provider, browser, upload, cost, or QA action completed unless
  it is backed by a real local event.
- Bind the local server to loopback and keep secrets out of project files.
