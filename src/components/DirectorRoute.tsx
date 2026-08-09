import {
  Box,
  Clapperboard,
  Globe2,
  Mic2,
  Sparkles,
  UserRound
} from "lucide-react";
import type { DirectorLane, DirectorPlan } from "../types";

const icons: Record<DirectorLane["id"], typeof UserRound> = {
  character: UserRound,
  voice: Mic2,
  "licensed-clips": Globe2,
  "ai-video": Sparkles,
  "blender-mockup": Box,
  "edit-qa": Clapperboard
};

const details: Record<DirectorLane["id"], string> = {
  character: "Licensed or consented human",
  voice: "Performance + exact timings",
  "licensed-clips": "Source, license and release",
  "ai-video": "Gemini · Veo · Flow route",
  "blender-mockup": "3D shell · authentic screen",
  "edit-qa": "Frame lock · mix · full decode"
};

const beats = [
  { id: "hook", label: "Hook", width: 8 },
  { id: "tension", label: "Tension", width: 22 },
  { id: "proof", label: "Proof", width: 24 },
  { id: "resolve", label: "Resolve", width: 25 },
  { id: "cta", label: "CTA", width: 21 }
];

export function DirectorRoute({ plan, compact = false }: { plan: DirectorPlan; compact?: boolean }) {
  return (
    <section className={`director-route ${compact ? "director-route-compact" : ""}`} aria-label="Autopilot Director route">
      <header className="director-route-heading">
        <div>
          <span>Autopilot Director</span>
          <strong>{plan.target.durationSeconds}s · {plan.target.aspectRatio} · {plan.shots.length} shots</strong>
        </div>
        <small>Plan {plan.planHash.slice(0, 8)} · nothing executed</small>
      </header>

      <div className="director-beats" aria-label="Story timing">
        {beats.map((beat) => (
          <span key={beat.id} style={{ flexBasis: `${beat.width}%` }}>
            <i />
            <small>{beat.label}</small>
          </span>
        ))}
      </div>

      <div className="director-lanes">
        {plan.lanes.map((lane) => {
          const Icon = icons[lane.id];
          const detail = lane.id === "ai-video" && lane.selected === false
            ? "Off · enable only when the story needs it"
            : details[lane.id];
          return (
            <article key={lane.id}>
              <Icon size={18} strokeWidth={1.55} />
              <div>
                <strong>{lane.label}</strong>
                <span>{detail}</span>
              </div>
              <i aria-label="Planned" />
            </article>
          );
        })}
      </div>

      {!compact ? (
        <footer className="director-route-footnote">
          <span>Blender shell</span>
          <b>+</b>
          <span>authentic screen capture</span>
          <b>+</b>
          <span>local composite &amp; QA</span>
        </footer>
      ) : null}
    </section>
  );
}
