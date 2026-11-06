# Phase 6 Testing Plan - Mobile and Accessibility Polish

## Overview
Phase 6 implements mobile-first loading states, reduced motion support, network timeout fallbacks, and dark mode verification across the Lekh application.

## Test Environment
- Desktop browsers (Chrome, Safari, Firefox)
- Mobile browsers (iOS Safari, Chrome Android)
- Screen readers (VoiceOver macOS/iOS, NVDA/JAWS Windows)
- Network throttling (Chrome DevTools)

## 1. Mobile-First Touch Targets (44px minimum)

### Test on 320px screen width
- [ ] Username input field minimum height: 44px
- [ ] Password input field minimum height: 44px
- [ ] All buttons maintain min-height: 44px
- [ ] Status indicators min-height: 44px
- [ ] Help button (?) dimensions: 44px × 44px
- [ ] Save status indicator accessible on small screens
- [ ] 12px padding around all status indicators

### Test on 480px screen width
- [ ] Spinner size increases to 18px diameter
- [ ] Status text font size increases to 16px
- [ ] Font weight becomes 500 for better visibility
- [ ] All touch targets still accessible

### Test on 768px+ screens
- [ ] Responsive adjustments apply correctly
- [ ] Touch targets maintain minimum sizes
- [ ] No responsive regressions

## 2. Reduced Motion Support (@media prefers-reduced-motion: reduce)

### macOS/iOS Testing
1. System Preferences → Accessibility → Display → Reduce motion (ON)
2. Refresh application

### Chrome DevTools Testing
1. DevTools → More Tools → Rendering
2. Emulate CSS media feature: "prefers-reduced-motion: reduce"

### Expected Behavior
- [ ] Spinners do NOT rotate but remain visible
- [ ] Button spinners display static dots (no pulse)
- [ ] Save status icon shows checkmark (no spin animation)
- [ ] Text still displays: "checking...", "saving...", "saved"
- [ ] No flashing or rapid animations
- [ ] Color feedback still indicates status
- [ ] Animation duration becomes 0.01ms effectively
- [ ] Page remains fully functional

## 3. Network Timeout Handling (5-second fallback)

### Simulate Slow Network
1. DevTools → Network → Slow 3G
2. Type a new username in form

### Expected Timeline
- 0-2 sec: "checking..." appears with spinner
- 2-5 sec: Spinner continues rotating (or shows as static)
- 5 sec: "checking... (taking longer than expected)" displays
- Can continue: User can keep typing/interacting

### Simulate Offline
1. DevTools → Network → Offline
2. Type a new username

### Expected Results
- [ ] After debounce delay: "unable to verify" appears
- [ ] User can retry by typing more characters
- [ ] Error announced to screen readers

## 4. Dark Mode Verification

### Light Mode Testing
- [ ] Accent blue (#0B57D0) readable on light background
- [ ] Success green (#28a745) readable
- [ ] Error red (#dc3545) readable
- [ ] Warning yellow (#ffc107) readable
- [ ] Spinners visible against light backgrounds

### Dark Mode Testing
1. Browser: Enable "Dark mode" or use system setting
2. Verify colors on dark background (#0B0B0C)

- [ ] Accent blue (#8AB4F8) readable on dark background
- [ ] Success green (#40d865) readable
- [ ] Error red (#ff6b6b) readable
- [ ] Warning yellow (#ffd93d) readable
- [ ] Spinners visible against dark backgrounds

### WCAG AA Contrast Verification (4.5:1 minimum)
Use Chrome DevTools → Accessibility:
- [ ] Text color vs background: ≥ 4.5:1 ratio
- [ ] Status indicators: ≥ 3:1 ratio
- [ ] Success indicator meets AA standard
- [ ] Error indicator meets AA standard
- [ ] Warning indicator meets AA standard

## 5. Accessibility Testing

### Screen Reader (VoiceOver / NVDA)
- [ ] Username input label announced
- [ ] Password input label announced
- [ ] Availability status updates announced
- [ ] aria-live="polite" announces changes without interrupting
- [ ] aria-atomic="true" reads complete status
- [ ] Error/success messages have role="alert"
- [ ] All interactive buttons announced
- [ ] Help button (?) clearly labeled
- [ ] Save status changes announced

### Keyboard Navigation
- [ ] Tab order is logical
- [ ] All inputs accessible via keyboard
- [ ] All buttons clickable with Enter/Space
- [ ] Focus indicators visible (outline/border)
- [ ] Escape key closes modals
- [ ] Can submit form without mouse

### Mobile Touch Testing
- [ ] All buttons have visual press feedback
- [ ] No hover-only UI elements
- [ ] Touch targets easy to activate (44px+)
- [ ] No accidental scrolls when tapping
- [ ] Pinch-to-zoom still works

## 6. Visual/Loading State Verification

### Availability Indicator States
- [ ] "checking..." shows rotating spinner (or static if reduced motion)
- [ ] "✓ available" shows checkmark in success green
- [ ] "✗ taken" shows X in error red
- [ ] "unable to verify" shows neutral gray
- [ ] Timeout message displays after 5 seconds

### Save Status Indicator (on [username].js)
- [ ] "saving..." shows spinning animation with accent color
- [ ] "saved" shows checkmark in success green
- [ ] Transitions smoothly between states
- [ ] Respects prefers-reduced-motion setting
- [ ] Positioned correctly on mobile (top-right)
- [ ] Doesn't overlap content

### Mobile Visual Layout
- [ ] All elements fit in 320px width
- [ ] No horizontal scrollbar
- [ ] Text readable at 100% zoom
- [ ] Fixed elements (stats, help button) don't overlap form
- [ ] Safe area margins respected on notched devices

## 7. Performance Verification

### Animation Performance
- [ ] Spinners animate smoothly at 60fps
- [ ] No jank or frame drops
- [ ] Minimal CPU/GPU usage
- [ ] Battery drain acceptable on mobile

### State Management
- [ ] Timeout cleanup happens properly
- [ ] No memory leaks from intervals
- [ ] Components unmount cleanly

## 8. Cross-Browser Compatibility

### Desktop Browsers
- [ ] Chrome 90+ (all features)
- [ ] Safari 14+ (all features)
- [ ] Firefox 88+ (all features)

### Mobile Browsers
- [ ] iOS Safari 14+ (responsive, touch, dark mode)
- [ ] Chrome Android (responsive, touch, dark mode)

### Feature Verification
- [ ] CSS custom properties work
- [ ] @media queries respond correctly
- [ ] Transitions smooth and performant
- [ ] aria-* attributes recognized
- [ ] Font sizing at 16px prevents iOS zoom

## Critical Path Testing

**Must Pass Before Release:**
1. ✓ Touch targets 44px on mobile
2. ✓ Reduced motion: no animations when enabled
3. ✓ Timeout message after 5 seconds
4. ✓ Text always visible (no animation-only feedback)
5. ✓ Dark mode colors readable
6. ✓ Screen reader announces status changes
7. ✓ Keyboard navigation works

## Sign-Off Checklist
- [ ] All critical path tests pass
- [ ] No console errors or warnings
- [ ] No accessibility violations in DevTools
- [ ] Load time acceptable
- [ ] Tested on at least 2 browsers
- [ ] Tested on mobile device or emulator

---
**Last Updated:** Phase 6 Implementation
**Status:** Ready for Testing
