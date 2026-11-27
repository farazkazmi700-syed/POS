# Kazmion V2 development

- Keep work for V2 on `feature/kazmion-v2-cloud`. Preserve V1 source, installers, and customer databases.
- Use Serena for targeted navigation and edits where supported. Reuse working modules and keep diffs focused. Skip generated artifacts and dependencies when searching.
- Preserve financial calculations and transaction semantics. Add targeted regression coverage when changing money movement, stock, access boundaries, or persistence.
- Run targeted checks before broader validation. Record completed work, actual test results, and open gates in `docs/PROGRESS.md`.
- Keep secrets out of source, browser builds, and output. Obtain approval before destructive operations, production deployments, or paid resources.
