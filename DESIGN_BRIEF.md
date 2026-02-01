# Lekh - Design Brief for Mockup Agents

## Project Overview
Lekh is a minimal, distraction-free writing tool. Think "terminal window for writing" - brutalist, functional, typography-focused. No decorative UI elements.

## Design Deliverables

### 1. Landing Page / Editor (Primary View)
The homepage IS the editor. No separate landing page.

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ lekh                                      [save →] │
├────────────────────────────────────────────────────┤
│                                                    │
│  Start writing...                                  │
│  █                                                 │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Specifications:**
- **Typography**: Monospace font (SF Mono, Menlo, or similar)
- **Font Size**: 18px
- **Line Height**: 1.6 (28.8px)
- **Max Width**: 70 characters (~600px at 18px monospace)
- **Colors**: 
  - Light mode: `#111111` on `#FAFAF7`
  - Dark mode: `#EDEDED` on `#0B0B0C`
- **Padding**: 20px on all sides
- **No borders, shadows, or decorative elements**

**States to Design:**
1. **Empty state**: Cursor blinking in textarea with "Start writing..." placeholder
2. **Typing state**: User has written 2-3 paragraphs
3. **Save prompt**: Floating bottom-right button that says "Save as lekh.space/yourname →"

### 2. Save Flow (Modal/Overlay)
Triggered when user clicks "Save" button.

**Layout:**
```
┌────────────────────────────────────────┐
│  Save your writing                     │
│                                        │
│  lekh.space/[yourname_____]           │
│                                        │
│  Password: [__________]                │
│  (to encrypt your writing)             │
│                                        │
│  ⚠️ If you forget this password,       │
│     your writing is lost forever       │
│                                        │
│           [Cancel]  [Create →]         │
└────────────────────────────────────────┘
```

**Specifications:**
- **Modal**: Semi-transparent dark overlay (rgba(0,0,0,0.6))
- **Card**: 400px wide, centered, white background
- **Same typography** as main editor
- **Input fields**: 1px solid border, no shadows
- **Buttons**: Minimal, text-only with subtle border

### 3. Saved State (Return Visit)
User returns to `lekh.space/yourname`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ yourname                    · all entries    [?]   │
├────────────────────────────────────────────────────┤
│                                                    │
│  Continue writing...                               │
│  █                                                 │
│                                                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Specifications:**
- Header includes: username, link to "all entries", help button (?)
- Same editor as before
- Auto-saves every 1 second (no visible save button)

### 4. Archive View (`/yourname/all`)
Shows all past writing sessions.

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ yourname - All Entries                             │
│ ← Back to write                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│  Jan 31, 2026 10:30 PM                            │
│  Dear diary, today I learned about...             │
│  [full entry text]                                 │
│                                                    │
│  ─────────────────────────────────────────         │
│                                                    │
│  Jan 30, 2026 9:15 PM                             │
│  Another day, another entry...                     │
│  [full entry text]                                 │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Specifications:**
- Chronological list, newest first
- Timestamp: 14px, #666 (light) / #999 (dark)
- Divider: 1px solid #ddd (light) / #333 (dark)
- Each entry shows full text (no truncation)

### 5. Mobile View (320px - 768px)
All above views must work on mobile.

**Key Changes:**
- Reduce padding to 12px
- Font size can drop to 16px on very small screens
- Save button becomes full-width at bottom
- Modal becomes full-screen sheet on mobile

## Design Constraints (Must Follow)

### Typography
- **Only monospace fonts**
- Consistent sizing throughout (18px body, 14px secondary)
- Line height always 1.6
- No font weights other than normal/bold

### Colors
- **Light mode**: Text `#111111`, Background `#FAFAF7`
- **Dark mode**: Text `#EDEDED`, Background `#0B0B0C`
- **Accent (links)**: `#0B57D0` (light), `#8AB4F8` (dark)
- **Warning**: `#dc3545` (light), `#ff6b6b` (dark)
- **Success**: `#28a745` (light), `#40d865` (dark)
- **NO OTHER COLORS**

### UI Elements
- No drop shadows
- No gradients
- No rounded corners (except buttons: 4px max)
- No animations (except cursor blink)
- No icons (except emoji: ⚠️ ✓ →)
- Borders: 1px solid, subtle colors

### Layout
- Max content width: 600px, centered
- Minimum touch target: 44px
- Consistent spacing: 8px, 12px, 20px, 40px (multiples of 4)

## User Flows to Show

### Flow 1: First-Time User
1. Lands on page → sees empty editor
2. Types a few sentences
3. Clicks "Save" button
4. Enters username + password
5. Gets confirmation: "Saved to lekh.space/yourname"

### Flow 2: Returning User
1. Visits `lekh.space/yourname`
2. Sees their previous URL, ready to write more
3. Types new content
4. Auto-saves (no action needed)

### Flow 3: Reading Archive
1. Clicks "all entries" link
2. Sees chronological list of all writing
3. Clicks "Back to write" to return

## Reference Examples

**Good:**
- Terminal applications (iTerm2, Hyper)
- Markdown editors (Typora in focus mode)
- write.as (but more minimal)

**Bad:**
- Medium editor (too many features)
- Notion (too complex)
- Google Docs (too much chrome)

## Technical Notes for Implementation

- Use `<textarea>` for main editor
- Auto-resize textarea height to content
- `spellCheck={false}` to avoid red underlines
- No placeholder animations
- Focus state: no outline, just cursor

## Success Criteria

A successful design will:
1. ✅ Look like a terminal window
2. ✅ Have zero visual distractions from writing
3. ✅ Work perfectly on iPhone SE and MacBook Pro
4. ✅ Use only 2 colors (text + background)
5. ✅ Load instantly (no images, no fonts to download)

## What NOT to Design

- ❌ Marketing pages
- ❌ Pricing pages
- ❌ Feature comparison tables
- ❌ Onboarding tours
- ❌ Settings pages
- ❌ Profile pages
- ❌ Social features

**This is a tool, not a product. Design it like Vim, not like Notion.**

---

## Output Format Needed

Please provide:
1. **Figma file** or **v0.dev link** with all 5 views
2. **Interactive prototype** showing the 3 user flows
3. **Mobile + Desktop** versions of each view
4. **Light + Dark mode** for each view

Total: 20 screens (5 views × 2 sizes × 2 themes)
