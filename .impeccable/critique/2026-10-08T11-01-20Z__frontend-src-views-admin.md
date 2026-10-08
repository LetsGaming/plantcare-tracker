---
target: modals, admin screens and Sales list
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\owner\\Documents\\github\\plantcare-tracker\\frontend\\src\\views\\admin"
timestamp: 2026-10-08T11-01-20Z
slug: frontend-src-views-admin
---
Method: dual-agent (A: design review, B: detector and browser evidence)

Score 24/40 (Acceptable). Modals, admin screens and Sales list. Specificity: authored shell, Ionic-default interior.

Heuristics: 1 status 3, 2 real world 2, 3 control 3, 4 consistency 2, 5 error prevention 3, 6 recognition 2, 7 efficiency 2, 8 minimalism 2, 9 error recovery 2, 10 help 2.

Priority issues
- P1 Typed confirmation input in the account deletion dialog is invisible (harden)
- P1 Modal forms are not one field system; edit modal appends an orphaned chart (layout, polish)
- P1 German copy defects: raw English enums, plurals, price formats, du/Sie (clarify)
- P2 Admin: thin dashboard, three unnamed recheck buttons, red server toast on a failed recheck, English errors (layout, harden)
- P2 Sales list: 24 of 24 NEU pills, letter tiles, no price on cards (bolder, layout)
- P3 Logout uses a stock alert, delete dialogs lack consequences and undo (polish)

Detector: CLI 0 findings on 13 targets. Overlay: mostly false positives (parents and children of the same element, off-screen collapsed ion-title); plausible real ones: tiny tab-badge text, text touching the viewport edge in the profile modal paragraph, icon tile above heading and a glow shadow on Login. Measured: all modals trap focus and close on Escape; real undersized targets: sales searchbar (42px), admin ion-back-button (112x32), calendar day buttons (40x44); lowest sustained text contrast 4.74.
