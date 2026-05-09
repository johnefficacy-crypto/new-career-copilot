# Frontend accessibility CI / manual checks

## Manual keyboard test checklist (modals/drawers)

- Open **Eligibility review drawer** from Admin Eligibility Queue.
- Verify focus moves into the drawer (Close button or first focusable control).
- Press `Tab` repeatedly and confirm focus remains trapped in the drawer.
- Press `Shift+Tab` and confirm reverse traversal remains trapped.
- Press `Escape` and confirm drawer closes.
- Confirm keyboard focus returns to the element that opened the drawer.
- Repeat with a record that renders no optional interactive child elements to verify no focus-loop errors in console.

- Open **Recruitment Edit** inline dialog panel.
- Verify focus enters the panel and tab order stays within while open.
- Press `Escape` and confirm panel closes and returns focus to opener.

- Open **Organization Edit** inline dialog panel.
- Verify focus enters, tab cycles inside, and `Escape` closes with focus restoration.

- Open **Source details** dialog in Admin Sources.
- Verify `role="dialog"`, `aria-modal="true"`, and labeled title are present via browser accessibility tree.
- Confirm `Tab` / `Shift+Tab` are trapped, `Escape` closes, and focus returns to “Show details” trigger.
