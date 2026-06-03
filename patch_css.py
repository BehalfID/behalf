import re

with open('/home/user/workspace/behalf/app/globals.css', 'r') as f:
    css = f.read()

# 1. Hero radial glow: increase opacity and coverage
css = css.replace(
    'rgba(99, 102, 241, 0.07), transparent 65%)',
    'rgba(99, 102, 241, 0.14), transparent 70%)'
)

# 2. Hero h1 tighter tracking and heavier weight
css = css.replace(
    '  font-size: clamp(3.2rem, 7.5vw, 7rem);\n  font-weight: 800;\n  line-height: 0.93;\n  letter-spacing: -0.04em;',
    '  font-size: clamp(3.2rem, 7.5vw, 7rem);\n  font-weight: 860;\n  line-height: 0.92;\n  letter-spacing: -0.05em;'
)

# 3. Section kicker: accent color + left border
css = css.replace(
    '.ui-kicker,\n.section-kicker,\n.console-kicker {\n  margin: 0 0 14px;\n  color: var(--muted);\n  font-size: 0.72rem;\n  font-weight: 700;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}',
    '.ui-kicker,\n.section-kicker,\n.console-kicker {\n  margin: 0 0 14px;\n  color: var(--accent);\n  font-size: 0.68rem;\n  font-weight: 700;\n  letter-spacing: 0.18em;\n  text-transform: uppercase;\n  border-left: 1.5px solid var(--accent);\n  padding-left: 10px;\n}'
)

# 4. Nav: slimmer, more precise
css = css.replace(
    '  min-height: 64px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 20px;\n  padding: 0 40px;\n  border-bottom: 1px solid var(--border);\n  background: rgba(0, 0, 0, 0.88);',
    '  min-height: 52px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 20px;\n  padding: 0 32px;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.06);\n  background: rgba(5, 8, 14, 0.94);'
)

# 5. Step visual cards: add grid texture
css = css.replace(
    '.home-step__visual {\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: clamp(20px, 3vw, 32px);\n  background: var(--surface);\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  min-height: 180px;\n}',
    '.home-step__visual {\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: clamp(20px, 3vw, 32px);\n  background: var(--surface);\n  background-image: linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);\n  background-size: 20px 20px;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  min-height: 180px;\n}'
)

# 6. Demo console: box shadow
css = css.replace(
    '.home-demo__console {\n  display: grid;\n  grid-template-columns: 1fr 148px 1fr;\n  align-items: stretch;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-xl);\n  background: var(--surface);\n  overflow: hidden;\n  transition: opacity 200ms ease;\n}',
    '.home-demo__console {\n  display: grid;\n  grid-template-columns: 1fr 148px 1fr;\n  align-items: stretch;\n  border: 1px solid rgba(255,255,255,0.09);\n  border-radius: 8px;\n  background: var(--surface);\n  overflow: hidden;\n  transition: opacity 200ms ease;\n  box-shadow: 0 0 0 1px rgba(99,102,241,0.08), 0 24px 64px rgba(0,0,0,0.5);\n}'
)

# 7. Hero CTA primary: sharper button
css = css.replace(
    '.home-cta-primary {\n  background: var(--accent);\n  border: 1px solid var(--accent);\n  color: #ffffff;\n}',
    '.home-cta-primary {\n  background: var(--accent);\n  border: 1px solid var(--accent);\n  color: #ffffff;\n  letter-spacing: 0.02em;\n  font-size: 0.875rem;\n}'
)

# 8. Home CTA section background glow
css = css.replace(
    '.home-cta {\n  text-align: center;\n  padding-block: clamp(80px, 10vw, 140px);\n  border-top: 1px solid var(--border);\n}',
    '.home-cta {\n  text-align: center;\n  padding-block: clamp(80px, 10vw, 140px);\n  border-top: 1px solid var(--border);\n  background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.07), transparent);\n}'
)

with open('/home/user/workspace/behalf/app/globals.css', 'w') as f:
    f.write(css)

print("CSS patched successfully")
