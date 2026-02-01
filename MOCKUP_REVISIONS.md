# Lekh Mockup Revisions - Final Pass

## Context
We have 3 existing mockups. After review, we need 1 revision + 2 new mockups to complete the set.

## Existing Mockups (Reference)
- `save_flow_modal_light/screen.png` - Good, needs minor changes
- `returning_user_pure_editor_dark/screen.png` - Wrong concept, ignore this
- `archive_view_dark/screen.png` - Perfect, keep as-is

---

## MOCKUP 1: Landing Page (Revision)

**File name:** `landing_page_with_explanation_light.png`

**What to change:**
Take the existing `save_flow_modal_light` mockup and add explanation text below the save bar.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ LEKH  lekh.space/[username]  password: [•••••••]  [create →]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ > Your words, encrypted. Once saved, permanent.             │
│ > Forget your password = lost forever.                      │
│                                                             │
│ Start writing...                                            │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                        0 WORDS              │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Explanation text:**
  - Font: Monospace, 14px
  - Color: #666 (gray)
  - Position: 20px below save bar, left-aligned with 40px left padding
  - Line height: 1.6
  - Two lines with `>` prefix (like terminal output)
- **Everything else:** Keep exactly as current mockup
- **Remove:** "MORE: BRUTALIST / DISTRACTION-FREE" tagline at bottom
- **Keep:** "0 WORDS" counter at bottom right

---

## MOCKUP 2: Returning User - Blank Editor (New)

**File name:** `returning_user_blank_editor_dark.png`

**What this is:**
A user who already claimed their username visits `lekh.space/username`. The editor is ALWAYS blank (write-only design). Each visit is a fresh session.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ guillermo · all entries · [?]                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Start writing...                                            │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│ 0 words   0 characters                                      │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**

**Header:**
- Username: `guillermo` (white text, left-aligned, 20px from left)
- Separator: ` · ` (white, between elements)
- Link: `all entries` (white, clickable appearance)
- Help button: `[?]` (white, right-aligned, 20px from right)
- Background: Same dark background as existing dark mockups
- Height: 60px
- Bottom border: 1px solid #333

**Editor area:**
- Background: Dark (#0B0B0C)
- Text: White (#EDEDED)
- Placeholder: "Start writing..." (gray #666)
- Cursor: Blinking white vertical line after placeholder
- Padding: 40px on all sides
- Font: Monospace, 18px
- Line height: 1.6

**Footer:**
- Text: `0 words   0 characters` (left-aligned, gray #666, 14px)
- Position: Bottom left, 20px padding
- NO "Synced" or "Export" links
- NO theme switcher icons

**Key difference from landing page:**
- NO save bar at top (auto-saves)
- NO explanation text (user already knows)
- HAS username in header
- HAS navigation links

---

## MOCKUP 3: Archive Password Prompt (New)

**File name:** `archive_password_prompt_light.png`

**What this is:**
User visits `lekh.space/username/all` to view their past entries. Before showing entries, they must enter password to decrypt.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ guillermo / all entries                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                                                             │
│              Enter password to decrypt entries              │
│                                                             │
│              Password: [___________________]                │
│                                                             │
│              [Unlock →]                                     │
│                                                             │
│              ⚠️  Forgot? Your entries are lost forever.     │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**

**Header:**
- Text: `guillermo / all entries`
- Font: Monospace, 18px, black
- Position: Top left, 20px padding
- Bottom border: 1px solid #ddd
- Height: 60px

**Centered Modal Content:**
- All elements vertically + horizontally centered
- Background: Light (#FAFAF7)

**Title:**
- Text: "Enter password to decrypt entries"
- Font: Monospace, 16px, black
- Margin bottom: 30px

**Password Field:**
- Label: "Password:" (inline, before input)
- Input: 300px wide, 44px tall
- Border: 1px solid #ccc
- Border radius: 4px
- Padding: 12px
- Font: Monospace, 16px
- Background: white
- Margin bottom: 20px

**Button:**
- Text: "Unlock →"
- Width: 300px (same as input)
- Height: 44px
- Background: Black (#111)
- Text color: White
- Border: None
- Border radius: 4px
- Font: Monospace, 16px
- Cursor: pointer
- Margin bottom: 20px

**Warning:**
- Text: "⚠️  Forgot? Your entries are lost forever."
- Font: Monospace, 14px
- Color: #dc3545 (red)
- Centered

---

## Design System (Apply to All)

### Colors
**Light mode:**
- Background: `#FAFAF7`
- Text: `#111111`
- Secondary text: `#666666`
- Border: `#ddd`
- Warning: `#dc3545`

**Dark mode:**
- Background: `#0B0B0C`
- Text: `#EDEDED`
- Secondary text: `#666`
- Border: `#333`

### Typography
- Font family: Monospace (SF Mono, Menlo, Consolas, or monospace)
- Body text: 18px
- Secondary text: 14px
- Line height: 1.6

### Spacing
- Use multiples of 4: 8px, 12px, 20px, 40px
- Max content width: 600px (centered)
- Padding: 20px on mobile, 40px on desktop

### Buttons
- Border: 1px solid, or filled background
- Border radius: 4px max
- Height: 44px minimum (touch target)
- Padding: 12px 24px

### NO DECORATIONS
- No drop shadows
- No gradients
- No animations (except cursor blink)
- No icons (except emoji: ⚠️ · →)
- No theme switcher UI

---

## Summary

Create 3 mockups:
1. **Revision:** Landing page + explanation text (light mode)
2. **New:** Returning user blank editor (dark mode)
3. **New:** Archive password prompt (light mode)

Keep existing:
- Archive view with entries (already perfect)

Total: 4 mockups complete the entire app flow.
