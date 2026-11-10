# Invitation automation decision

## Decision

Unattended invitation acceptance remains disabled. Invitation identity is now supported by live evidence, but coverage and a trustworthy historical/new-arrival boundary remain unverified. No live invitations were accepted during this investigation.

## Live evidence — November 10, 2026

Two read-only investigation runs each captured seven observations using the existing authenticated profile. Each run included a refresh, navigation away and back, three attempts to reveal more content by scrolling, and a full browser process/context restart. No conversation was opened.

- The one currently visible historical card had a unique `componentkey` matching `urn:li:invitation:<digits>`.
- The same identifier survived refresh, navigation and browser restart. It matched the persisted historical baseline, whose records were not reset.
- No separate `data-invitation-id` attribute was present. The invitation URN in `componentkey` provides a better identity contract than an arbitrary render key. Other key formats are not trusted by the adapter.
- Every observation showed one card. The list uses `LazyColumn`; there was no numeric total, `aria-setsize`, `aria-posinset`, load-more control, or verified end-of-pagination marker. Scrolling revealed no additional card, which does not prove complete coverage.
- No machine-readable creation/arrival timestamp or relative-age label was found on the card.

Earlier, one user-confirmed new card was distinguished from the persisted historical key, explicitly approved, accepted, and verified while preserving the historical card. That result validates controlled targeting, not unattended newness classification.

## Why individually observed identities are insufficient

An invitation absent from the observed set may have arrived recently, or may be historical and newly rendered because of delayed loading, pagination, a filter, or a network recovery. Stable identity does not distinguish those cases. First observed locally is not the same as newly received by LinkedIn.

The runner therefore persists every newly observed unknown identity as historical/quarantined while coverage is unverified. It retains original historical, accepted and uncertain records across restarts. Repeatedly reaching a visually unchanged bottom does not promote the baseline to complete. No environment flag overrides the live adapter's `complete: false` result.

Safe activation would require an authoritative complete pending-invitation snapshot at the baseline boundary, or independently verified creation/arrival evidence that distinguishes later arrivals from delayed historical records. Neither is currently established through the inspected UI.

## Validation and active mode

`npm.cmd test`: 33 passing tests covering repeated polls, persisted baselines/restarts, delayed historical appearance, separate virtualized pages, duplicate and missing identifiers, exact targeting, uncertain outcomes, and historical preservation. Browser tests use synthetic HTML and do not establish live coverage.

During the invitation investigation the observer used `--invitations-only` with an 8,000 ms delay and did not open conversations. Full assessment operation subsequently restored normal monitoring (`npm.cmd start`): automatic message replies are enabled behind the activation baseline and deduplication safeguards, while invitation acceptance remains blocked by coverage. Browser profile, message state, historical-message protection and invitation records remain local and preserved.
