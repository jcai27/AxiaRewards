## verdict

1. Resolved — desktop.png keeps queue, record references, outcome and actions together in the viewport. desktop-conditions-bottom.png shows the final conditions while those controls remain visible; desktop-queue-navigation.png shows a later selected row beside its updated record with evidence reset to the top. Source reveals selection with scrollIntoView and extends the rendered limit during J/K and automatic advance. Parent reports the 45-step navigation integration check passed.
2. Resolved — all four primary recaptures show clearly visible condition, queue, reference and panel boundaries. The darker rules retain the thin, flat document geometry.
3. Resolved — desktop.png and mobile.png visibly explain “Approval blocked: clear the fraud-review hold before approving this rebate” beside the disabled approval action.
4. Resolved — the search placeholder is visibly darker in desktop.png and mobile.png; source confirms `--ax-text-3` (#5b6070) at opacity 1, meeting the 4.5:1 requirement on white.

## remaining

Clear. All six required recaptures are valid. No regressions from the fix batch identified. Ship covers the scored fixes, not the whole surface.

disposition: ship
