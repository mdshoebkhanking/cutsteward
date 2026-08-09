import { navigate } from "../lib/router";

export function Brand() {
  return (
    <button className="brand" type="button" onClick={() => navigate("/")} aria-label="CutSteward home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 40" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M27 3H5v34h22" />
          <path d="m9.5 21 4.2 4.2L23 15.5" />
        </svg>
      </span>
      <span>CutSteward</span>
    </button>
  );
}
