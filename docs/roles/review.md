# Review Role

Check behavior against the acceptance conditions.

- Run `npm run check` and the relevant self-tests.
- Run renderer, UI, or platform checks when the change affects them.
- Use temporary HOME and data paths.
- Record commands, results, and evidence in `docs/review-<stage>.md`.

Report failures as findings. Do not hide them in the commit message.
