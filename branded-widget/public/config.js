export const themes = {
  light: { label: 'Cloud', description: 'Clean & light', bg: '#ffffff', surface: '#f5f6fa', text: '#202434', muted: '#646b7d', border: '#e5e8ef', accent: '#435de3', onAccent: '#ffffff' },
  dark: { label: 'Midnight', description: 'Soft dark', bg: '#171923', surface: '#232635', text: '#f2f3f8', muted: '#afb5ca', border: '#35394b', accent: '#a5a7ff', onAccent: '#171923' },
  black: { label: 'Obsidian', description: 'Pure black', bg: '#090909', surface: '#191919', text: '#fafafa', muted: '#ababab', border: '#333333', accent: '#ffffff', onAccent: '#090909' },
  white: { label: 'Paper', description: 'Black & white', bg: '#ffffff', surface: '#f4f4f4', text: '#171717', muted: '#666666', border: '#e3e3e3', accent: '#171717', onAccent: '#ffffff' },
  ocean: { label: 'Ocean', description: 'Fresh blue', bg: '#f5fbff', surface: '#e7f3fa', text: '#143347', muted: '#526e80', border: '#d0e5f0', accent: '#096c9e', onAccent: '#ffffff' },
  violet: { label: 'Lavender', description: 'A little playful', bg: '#fbf8ff', surface: '#f1eafa', text: '#362447', muted: '#786685', border: '#e7dcf1', accent: '#7951be', onAccent: '#ffffff' },
  emerald: { label: 'Sage', description: 'Calm & natural', bg: '#f7fbf8', surface: '#eaf2ed', text: '#20392b', muted: '#5e7567', border: '#d8e6dc', accent: '#28734c', onAccent: '#ffffff' },
  sunset: { label: 'Terracotta', description: 'Warm & welcoming', bg: '#fffbf7', surface: '#faeee5', text: '#493026', muted: '#85685a', border: '#efddd0', accent: '#b54b2a', onAccent: '#ffffff' },
}
export const defaults = { name: 'Dineezy Assistant', tagline: 'Your guide to Dineezy.', welcome: 'Welcome to Dineezy. How can I help?\nAsk me about features, pricing, or getting started.', logo: '', theme: 'light', position: 'right', radius: '24', launcher: 'Ask Dineezy', suggestions: ['What is Dineezy?', 'Tell me about pricing', 'How do I get started?'] }
export function safeLogo(value) {
  if (typeof value !== 'string' || value.length > 350000) return ''
  if (/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(value)) return value
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : '' } catch { return '' }
}
export function normalize(value = {}) {
  if (!value || typeof value !== 'object') value = {}
  const text = (key, max) => typeof value[key] === 'string' ? value[key].trim().slice(0, max) : defaults[key]
  return { name: text('name', 60) || defaults.name, tagline: text('tagline', 140), welcome: text('welcome', 500), launcher: text('launcher', 40), logo: safeLogo(value.logo), theme: Object.hasOwn(themes, value.theme) ? value.theme : 'light', position: value.position === 'left' ? 'left' : 'right', radius: ['12', '24', '32'].includes(String(value.radius)) ? String(value.radius) : '24', suggestions: Array.isArray(value.suggestions) ? value.suggestions.filter(v => typeof v === 'string').map(v => v.trim().slice(0, 100)).filter(Boolean).slice(0, 3) : [...defaults.suggestions] }
}
export function applyTheme(element, config) {
  const palette = themes[config.theme]
  for (const [key, value] of Object.entries(palette)) if (key !== 'label' && key !== 'description') element.style.setProperty(`--${key}`, value)
  element.style.setProperty('--radius', `${config.radius}px`)
  element.style.colorScheme = ['dark', 'black'].includes(config.theme) ? 'dark' : 'light'
}
export function avatar(element, config) {
  element.replaceChildren()
  if (config.logo) { const img = document.createElement('img'); img.src = config.logo; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => { element.textContent = config.name.slice(0, 1).toUpperCase() }, { once: true }); element.append(img) }
  else element.textContent = config.name.slice(0, 1).toUpperCase()
}
