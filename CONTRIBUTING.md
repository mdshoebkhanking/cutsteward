# Contributing to CutSteward

Thanks for helping improve CutSteward. Small, auditable changes are preferred
to broad rewrites.

## Development setup

1. Install Node.js 22.12 or newer.
2. Run `npm ci`.
3. Run `npm run build` and `npm test` before opening a pull request.
4. For media-path changes, also run `npm run production:smoke`.

## Pull requests

- Explain the user problem, security boundary, and evidence used to validate
  the change.
- Add or update tests for every meaningful behavior change.
- Never include secrets, browser profiles, raw private media, provider caches,
  or unlicensed stock.
- Keep external actions fail-closed and bind consequential approvals to the
  exact request/scope.
- Distinguish a detected tool, planned route, queued job, and verified output.
- Update `SESSION_LOG.md` when work spans multiple sessions or changes the
  production contract.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository. Third-party assets retain their original licenses.
