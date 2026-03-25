# HTML & CSS Style Guide for Naraseo AI Website

## Color Palette (CSS Variables)
```
--primary: #6366f1 (Indigo)
--primary-hover: #4f52d6 (Darker indigo)
--primary-dim: rgba(99,102,241,0.15) (Transparent indigo)
--bg: #0f172a (Dark blue-gray background)
--surface: #1e293b (Lighter surface)
--surface2: #263248 (Even lighter surface)
--border: #334155 (Border color)
--text: #f1f5f9 (Main text)
--text-muted: #94a3b8 (Secondary text)
--text-dim: #64748b (Tertiary text)
--green: #22c55e (Success)
--yellow: #eab308 (Warning)
--red: #ef4444 (Error)
--radius: 10px (Border radius)
```

## Typography
- **Font Family:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Base Font Size:** `15px`
- **Line Height:** `1.6`

### Font Sizes
- **H1:** `32px-36px`, `font-weight: 800`, `letter-spacing: -0.5px`
- **H2:** `20px-26px`, `font-weight: 700`
- **H3:** `15px-18px`, `font-weight: 700`, `color: var(--primary)`
- **Body:** `15px`, `color: var(--text-muted)`, `line-height: 1.7`
- **Small:** `13px-14px`, `color: var(--text-dim)`
- **Labels:** `11px-12px`, `text-transform: uppercase`, `letter-spacing: 0.5px`

## Layout Patterns

### Containers
- **Max-width:** `1100px`
- **Padding:** `32px` on desktop, `16px` on mobile
- **Margin:** `0 auto` (centered)

### Spacing
- **Top/Bottom Sections:** `48px` padding
- **Between Elements:** `16px-24px` gap
- **Card Padding:** `32px`
- **Button Padding:** `12px 24px`

### Border Radius
- **Cards/Buttons:** `10px` (medium)
- **Small Elements:** `6px-8px`
- **Large Sections:** `14px-16px`

## HTML Patterns

### Navigation
```html
<nav>
  <a href="index.html" class="nav-logo">
    <div class="nav-logo-mark">
      <!-- 26x26 SVG icon -->
    </div>
    Naraseo AI
  </a>
  <ul class="nav-links">
    <li><a href="#">Link</a></li>
  </ul>
  <div class="nav-actions">
    <a href="#" class="btn btn-ghost">Action</a>
  </div>
</nav>
```

### Hero Section
```html
<section class="hero">
  <div class="hero-inner">
    <div>
      <div class="hero-badge">✓ Status text</div>
      <h1>Main title with <span class="gradient">gradient</span></h1>
      <p class="hero-sub">Subtitle/description</p>
      <div class="hero-ctas">
        <a href="#" class="btn btn-primary btn-lg">Primary CTA</a>
        <a href="#" class="btn btn-outline btn-lg">Secondary CTA</a>
      </div>
    </div>
  </div>
</section>
```

### Cards
```html
<div class="card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 32px;">
  <h3>Title</h3>
  <p>Content</p>
</div>
```

### Feature Grid
```html
<div class="guide-grid">
  <!-- 3-column auto-fit grid -->
  <div class="guide-card">
    <div class="guide-icon">🎯</div>
    <h2>Title</h2>
    <p>Description</p>
  </div>
</div>
```

### Buttons
```html
<!-- Primary -->
<a href="#" class="btn btn-primary">Primary Button</a>

<!-- Outline -->
<a href="#" class="btn btn-outline">Outline Button</a>

<!-- Ghost -->
<a href="#" class="btn btn-ghost">Ghost Button</a>

<!-- Large -->
<a href="#" class="btn btn-primary btn-lg">Large Button</a>
```

### Forms
```html
<form class="form">
  <div class="field">
    <label for="input">Label</label>
    <input id="input" type="text" placeholder="Placeholder" />
    <div class="field-error" id="error">Error message</div>
  </div>
  <button type="submit" class="btn btn-primary">Submit</button>
</form>
```

### Alerts/Notes
```html
<div class="note">
  <strong>💡 Title:</strong> Description text
</div>

<div class="alert error">
  <svg><!-- icon --></svg>
  <span>Error message</span>
</div>
```

## CSS Patterns

### Flexbox Centering
```css
display: flex;
align-items: center;
justify-content: center;
```

### Grid Auto-fit
```css
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 24px;
```

### Smooth Transitions
```css
transition: all 0.15s;
/* or */
transition: background 0.15s, color 0.15s;
```

### Hover States
```css
.element:hover {
  color: var(--text);
  background: var(--surface2);
  transform: translateY(-1px);
}
```

### Mobile Responsive
```css
@media (max-width: 768px) {
  /* Mobile styles */
}

@media (max-width: 480px) {
  /* Small mobile styles */
}
```

### Backdrop Blur (for sticky nav)
```css
background: rgba(15, 23, 42, 0.95);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
```

### Gradient Text
```html
<span class="gradient">Gradient text</span>
```

```css
.gradient {
  background: linear-gradient(160deg, #6366f1 0%, #4f52d6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Sticky Navigation
```css
nav {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--border);
}
```

### Smooth Scroll
```css
html {
  scroll-behavior: smooth;
}
```

## Accessibility (a11y)

### Always Include
- `alt` text on all images
- `for` attribute on labels pointing to input `id`
- `type` on all buttons
- Sufficient color contrast (4.5:1 for text)
- Focus states on interactive elements

### Focus Styles
```css
input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-dim);
  outline: none;
}
```

## Performance Tips

1. **Use CSS variables** for colors (easier to maintain)
2. **Avoid inline styles** - use classes
3. **Minimize hover animations** on mobile
4. **Use system fonts** not custom fonts
5. **Optimize images** - use modern formats (webp)
6. **Lazy load images** - add `loading="lazy"`
7. **Remove unused CSS** - keep stylesheets clean

## Common Elements to Always Include

### In `<head>`
```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="..." />
<title>Page Title — Naraseo AI</title>
```

### In `<body>`
- Top navigation bar
- Main content section
- Footer with links
- JavaScript for interactivity

### Security Headers (CSS)
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system fonts;
  background: var(--bg);
  color: var(--text);
}

a {
  color: inherit;
  text-decoration: none;
}
```

## File Organization

```
website/
├── index.html          (Landing page)
├── login.html          (Sign up / Login)
├── dashboard.html      (User dashboard)
├── help.html           (User guide)
├── docs.html           (API documentation)
└── STYLE_GUIDE.md      (This file)
```

## Naming Conventions

### CSS Classes
- Use kebab-case: `.nav-logo`, `.btn-primary`, `.hero-badge`
- Use semantic names: `.alert`, `.success`, `.error`
- Avoid IDs - use classes for styling
- Use data attributes for JS: `data-tab="overview"`

### HTML IDs
- Use kebab-case: `id="demo-url"`, `id="api-key-text"`
- Only use for form labels and JavaScript targets
- Never style with `#id` selectors

### Variables
- Color: `--primary`, `--text-muted`
- Spacing: `--spacing-md`, `--radius`
- Transitions: `--transition-fast` (0.15s)

## Testing Checklist

- [ ] Mobile responsive (test at 480px, 768px, 1024px)
- [ ] All links work (internal and external)
- [ ] Forms validate and submit
- [ ] Images load and have alt text
- [ ] Color contrast passes WCAG AA
- [ ] No console errors
- [ ] Navigation is sticky/fixed where needed
- [ ] Buttons have hover states
- [ ] Loading states show spinners
- [ ] Dark mode displays correctly

## Key Principles

1. **Consistency** — Use the same colors, spacing, fonts everywhere
2. **Simplicity** — Don't over-complicate; prefer defaults
3. **Accessibility** — Always think about screen readers and keyboard users
4. **Performance** — Minimize animations, optimize images
5. **Mobile-first** — Build for mobile, enhance for desktop
6. **Dark mode** — All pages use the dark color palette by default
