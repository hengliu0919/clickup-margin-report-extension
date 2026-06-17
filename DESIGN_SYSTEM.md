# Design System Documentation

## Overview

This design system provides a consistent, accessible, and maintainable foundation for the ClickUp Margin Report extension. It includes design tokens, reusable components, and layout utilities with full dark mode support.

## Design Tokens

### Spacing Scale (4px base)
```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
```

### Typography Scale
```css
--text-xs: 11px   /* Labels, badges */
--text-sm: 12px   /* Secondary text */
--text-base: 14px /* Body text */
--text-lg: 16px   /* Subheadings */
--text-xl: 20px   /* Page titles */
--text-2xl: 24px  /* Large metrics */
```

### Colors
- **Brand**: Indigo palette (--brand-50 through --brand-700)
- **Danger**: Red palette
- **Warning**: Amber palette
- **Success**: Green palette
- **Info**: Sky blue palette

### Border Radius
```css
--radius-sm: 6px   /* Inline elements */
--radius-md: 8px   /* Buttons, inputs */
--radius-lg: 12px  /* Cards */
--radius-xl: 16px  /* Large containers */
--radius-full: 999px /* Pills, badges */
```

## Components

### Buttons

```html
<!-- Primary action -->
<button class="btn btn-primary">Save Changes</button>

<!-- Secondary action -->
<button class="btn btn-secondary">Cancel</button>

<!-- Ghost/tertiary -->
<button class="btn btn-ghost">Learn More</button>

<!-- Danger action -->
<button class="btn btn-danger">Delete</button>

<!-- Small size -->
<button class="btn btn-primary btn-sm">Compact</button>

<!-- Icon only -->
<button class="btn btn-icon btn-secondary">×</button>
```

### Cards

```html
<!-- Standard card -->
<div class="card">
  <h2>Card Title</h2>
  <p>Card content...</p>
</div>

<!-- Compact card -->
<div class="card card-compact">
  <p>Less padding</p>
</div>
```

### Alerts

```html
<!-- Info alert -->
<div class="alert alert-info">
  <span class="alert-icon">ℹ️</span>
  <div class="alert-content">
    <p class="alert-title">Information</p>
    <p class="alert-description">This is an informational message.</p>
  </div>
</div>

<!-- Warning alert -->
<div class="alert alert-warning">
  <span class="alert-icon">⚠️</span>
  <div class="alert-content">
    <p class="alert-title">Warning</p>
    <p class="alert-description">Please review this carefully.</p>
  </div>
</div>

<!-- Success alert -->
<div class="alert alert-success">
  <span class="alert-icon">✓</span>
  <div class="alert-content">
    <p class="alert-title">Success</p>
    <p class="alert-description">Operation completed.</p>
  </div>
</div>

<!-- Danger alert -->
<div class="alert alert-danger">
  <span class="alert-icon">✕</span>
  <div class="alert-content">
    <p class="alert-title">Error</p>
    <p class="alert-description">Something went wrong.</p>
  </div>
</div>
```

### Badges

```html
<span class="badge badge-info">Info</span>
<span class="badge badge-warning">Warning</span>
<span class="badge badge-success">Active</span>
<span class="badge badge-danger">Error</span>
<span class="badge badge-brand">ClickUp</span>
```

### Metrics

```html
<div class="metric">
  <span class="metric-label">Revenue</span>
  <strong class="metric-value">$12,340</strong>
</div>
```

### Data Tables

```html
<div class="table-container">
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Column 1</th>
          <th>Column 2</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Data 1</td>
          <td>Data 2</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Compact scroll height -->
<div class="table-container">
  <div class="table-scroll table-scroll-compact">
    <!-- table content -->
  </div>
</div>
```

### Empty States

```html
<div class="empty-state">
  <div class="empty-state-icon">📊</div>
  <div class="empty-state-title">No data yet</div>
  <div class="empty-state-description">
    Get started by running your first report.
  </div>
  <button class="btn btn-primary">Run Report</button>
</div>
```

### Loading Skeleton

```html
<!-- Text skeleton -->
<div class="skeleton skeleton-text"></div>

<!-- Heading skeleton -->
<div class="skeleton skeleton-heading"></div>

<!-- Custom skeleton -->
<div class="skeleton" style="width: 200px; height: 40px;"></div>
```

## Layout Utilities

### Stack (Vertical spacing)

```html
<!-- Small spacing -->
<div class="stack stack-sm">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Medium spacing (default) -->
<div class="stack stack-md">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Large spacing -->
<div class="stack stack-lg">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Cluster (Horizontal grouping)

```html
<!-- Default cluster -->
<div class="cluster">
  <button>Button 1</button>
  <button>Button 2</button>
  <button>Button 3</button>
</div>

<!-- Small gap -->
<div class="cluster cluster-sm">
  <span>Tag 1</span>
  <span>Tag 2</span>
</div>

<!-- Medium gap -->
<div class="cluster cluster-md">
  <button>Action 1</button>
  <button>Action 2</button>
</div>
```

### Grid

```html
<div class="grid">
  <div>Grid item 1</div>
  <div>Grid item 2</div>
  <div>Grid item 3</div>
</div>
```

## Typography

### Headings

```html
<p class="eyebrow">Category</p>
<h1>Main Page Title</h1>
<h2>Section Heading</h2>
<h3>Subsection</h3>
```

### Text Utilities

```html
<p class="text-sm">Small text</p>
<p class="text-xs">Extra small text</p>
<p class="text-muted">Muted/tertiary text</p>
```

## Form Elements

### Input Fields

```html
<label>
  Field Label
  <input type="text" placeholder="Enter text..." />
</label>
```

### Textarea

```html
<label>
  Description
  <textarea placeholder="Enter description..."></textarea>
</label>
```

### Select

```html
<label>
  Choose Option
  <select>
    <option>Option 1</option>
    <option>Option 2</option>
  </select>
</label>
```

### Checkbox & Radio

```html
<label class="cluster">
  <input type="checkbox" />
  <span>Accept terms</span>
</label>

<label class="cluster">
  <input type="radio" name="choice" />
  <span>Option A</span>
</label>
```

## Responsive Design

### Breakpoints
- Mobile: < 640px
- Desktop: ≥ 640px

### Mobile Utilities

```html
<div class="hide-mobile">Hidden on mobile</div>
```

### Responsive Behavior
- Metrics grid: 2 columns on mobile, 4 on desktop
- Settings grid: 1 column on mobile, auto-fit on desktop
- Topbar: stacks vertically on mobile

## Dark Mode

Dark mode is automatically enabled based on system preferences via `prefers-color-scheme: dark`. All color tokens automatically adjust.

### Testing Dark Mode
```css
/* Force dark mode for testing */
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: dark;
    /* Apply dark mode colors here */
  }
}
```

## Accessibility

- All interactive elements have proper focus states with visible outlines
- Color contrast meets WCAG AA standards
- Semantic HTML5 elements (header, main, section, nav)
- ARIA labels and roles where appropriate
- Keyboard navigation support

## Best Practices

1. **Use design tokens** instead of hardcoded values
2. **Combine utility classes** rather than creating new ones
3. **Maintain spacing consistency** using the spacing scale
4. **Use semantic HTML** for better accessibility
5. **Test dark mode** during development
6. **Optimize for mobile** from the start
7. **Keep components simple** and composable

## Migration Guide

To migrate existing code to the design system:

1. Replace `<link href="styles.css">` with `<link href="styles-new.css">`
2. Update class names:
   - `.panel` → `.card`
   - `.secondary` button → `.btn .btn-secondary`
   - Primary button → `.btn .btn-primary`
   - `.actions` → `.cluster`
   - `.empty` → `.table-empty` or `.empty-state`
3. Use new alert component instead of inline status messages
4. Apply metric component for stats display
5. Use badge component for status indicators

## Examples in Production

### Popup Page
- Alert for non-ClickUp domain warning
- Status bar with collapsible warnings badge
- Metrics grid for financial summary
- Data table with empty state
- Button cluster for actions

### Options Page
- Section headings with action buttons
- Storage option cards with radio selection
- Editable data tables
- Advanced collapsible section
- Validation summary with badges
