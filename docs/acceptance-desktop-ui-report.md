# Acceptance report: desktop UI widths (Task 67)

Date: 2026-09-26  
Scope: T23; PRD §4 (items 11, 12, 16, 18, 23, 26)

## Automated viewport checks

`tests/smoke/desktop-layout.spec.js` runs at 1024×900, 1280×900, and 1440×900. Each viewport verifies:

- heading, display-name input, and primary button are visible;
- document `scrollWidth` does not exceed viewport width;
- a long participant name remains accepted and visible in the input;
- a screenshot is captured for the acceptance record.

The four-participant smoke additionally exercises the 4-tile grid, while the chat-history smoke exercises the long history window. Existing unit tests cover participant-grid status/error placeholders and autoplay fallback.

## Screenshots

- [1024 px](screenshots/task-67-home-1024.png)
- [1280 px](screenshots/task-67-home-1280.png)
- [1440 px](screenshots/task-67-home-1440.png)

## Result

Desktop layout checks pass at all three target widths. Controls remain accessible, no horizontal overflow is introduced, and long names are handled by the existing wrapping styles. Four-tile, history, and error/placeholder behavior is covered by the linked smoke/unit suites.
