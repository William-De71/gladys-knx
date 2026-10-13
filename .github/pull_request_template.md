<!--
The TITLE of this pull request becomes the squash commit, then the line users
read in CHANGELOG.md and in the GitHub Release. Write it in English, as a
Conventional Commit describing the change for the user:

  feat(devices): add fans with a speed group address
  fix(covers): stop a moving cover with the step group address
  feat(widgets): filter the bus monitor by main group
  docs: explain how to find the tunnel user ID in ETS

feat -> minor version, fix / perf -> patch, `!` or a "BREAKING CHANGE:" footer
-> breaking (a minor while the version is below 1.0.0). docs, chore, ci, test,
style, refactor and build alone publish no release. Never edit CHANGELOG.md.
-->

## What changes for the user

## How it was tested

- [ ] `npm run format:check`, `npm run lint` and `npm test` pass
- [ ] Tried on a real KNX installation (interface model, connection mode):
- [ ] Widget content changed: `docs/illustrations/render.sh` run again
- [ ] The four docs (`docs/en.md`, `fr`, `de`, `es`) and READMEs are up to date
