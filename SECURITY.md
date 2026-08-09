# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability-reporting feature for this repository. Include the
affected version, a minimal reproduction, impact, and any suggested mitigation.
Do not include real credentials, cookies, private media, or personal data.

## Security boundaries

CutSteward is local-first and loopback-only by default, but it can coordinate
powerful local tools and external providers. Treat every provider credential,
browser profile, source file, approval receipt, and run workspace as sensitive.

- Never commit `.env*`, `.framepilot/`, browser profiles, provider caches,
  approval secrets, or raw private media.
- Enter passwords, MFA codes, passkeys, CAPTCHAs, and payment details yourself.
- Review exact upload, spend, license, publish, install, and destructive-action
  proposals at the point of risk.
- Run `npm run doctor`, the test suite, and the secret/size checks before a
  public release.
- Do not expose the loopback server through a tunnel or reverse proxy without a
  separate threat model and authentication layer.

CutSteward cannot make an untrusted website, model, plugin, or downloaded asset
safe merely by routing it through an agent. The durable kernel records evidence;
it does not replace human rights, privacy, and release review.
