# Rudraksh Bhandari - Portfolio Website

A modern, responsive portfolio showcasing my projects, experience, and skills as a Computer Science student at UC San Diego.

**Live site:** [rudrakshbhandari.com](https://rudrakshbhandari.com)

## Highlights

- **Modern Design** - Clean layout with smooth animations and custom cursor effects
- **Fully Responsive** - Mobile-first design that works seamlessly across all devices
- **Performance Optimized** - Preloaded critical resources, efficient CSS/JS
- **Accessible** - Semantic HTML, ARIA labels, keyboard navigation
- **SEO Ready** - JSON-LD structured data, Open Graph tags, proper meta tags

## Built With

- **HTML5** - Semantic markup with accessibility features
- **CSS3** - Grid, Flexbox, custom properties, and animations
- **JavaScript** - Vanilla JS for interactions and scroll animations
- **Font Awesome** - Icons for social links and UI elements
- **Google Fonts** - Space Grotesk and Inter for typography
- **GitHub Pages** - Static hosting and deployment
- **Cloudflare** - DNS, analytics, headers, caching, and `/health` rewrite
- **Google Analytics 4** - Event attribution and traffic source analysis

## Project Structure

```
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # Custom CSS with animations
├── health/
│   └── index.html      # Health metrics page
├── js/
│   ├── main.js         # Core functionality
│   ├── animations.js   # Scroll and interaction animations
│   ├── config.js       # Analytics provider configuration
│   ├── health.js       # Health dashboard logic
│   └── analytics.js    # Analytics bootstrapping + event tracking hooks
├── img/                # Favicons, profile photos, project images
├── scripts/            # Utility scripts
├── CHANGELOG.md        # Release notes and change history
├── CNAME               # Custom domain for GitHub Pages
└── package.json        # Development dependencies
```

## Local Development

```bash
# Install dependencies
npm install

# Format code
npm run format

# Run CI-equivalent checks
npm run ci:check

# Serve locally (any static server)
npx serve .
```

## Analytics

Set `window.SITE_CONFIG.ga4MeasurementId` in [`js/config.js`](/Users/rudrakshbhandari/.codex/worktrees/9f8a/mywebsite/js/config.js) before enabling GA4 event tracking. Cloudflare Web Analytics is enabled from the Cloudflare dashboard for the proxied zone.

### Tracked Events

The site emits the following events through `js/analytics.js`:

- `portfolio_page_view`
- `health_page_view`
- `resume_click`
- `contact_email_click`
- `social_click` (includes `network` payload)
- `health_nav_click`

### Where to View Data

- Cloudflare dashboard → **Web Analytics** for page traffic and performance telemetry.
- Google Analytics → **Reports** / **Realtime** / **Engagement** for custom events and acquisition.

### Validation Checklist

1. Open the production site in an incognito window.
2. Open DevTools → Network and confirm:
   - `https://www.googletagmanager.com/gtag/js?id=...` returns `200`
3. Trigger a few actions (open `/health`, click résumé, click social links).
4. Wait 1-2 minutes and refresh the Cloudflare and GA4 dashboards.

## Health Data Pipeline

- Health data is written to `oura_public.json` by `.github/workflows/oura-update.yml`.
- The workflow runs every 5 minutes (`*/5 * * * *`) and commits only when data changes.
- Public data includes daily aggregates plus a downsampled intraday heart-rate series for charting on `/health`.
- GitHub Pages deploys from `.github/workflows/pages.yml`.

## Release Cadence

- Update `CHANGELOG.md` for every merged feature/fix.
- Batch non-urgent updates into weekly releases.
- Ship urgent bug/security fixes immediately with a dated changelog entry.

## Sections

- **Hero** - Introduction with animated headline
- **About** - Background, education, and achievements
- **Currently** - What I'm working on now
- **Experience** - Professional timeline
- **Projects** - Technical projects with live demos
- **Case Studies** - Deep dives on impact and engineering decisions
- **Skills** - Technologies and tools
- **Contact** - Email and social links

## Contact

- **Email:** [rubhandari@ucsd.edu](mailto:rubhandari@ucsd.edu)
- **LinkedIn:** [linkedin.com/in/rudrakshbhandari](https://www.linkedin.com/in/rudrakshbhandari)
- **GitHub:** [github.com/rudrakshbhandari](https://github.com/rudrakshbhandari)
- **Twitter/X:** [x.com/rudrakshb06](https://x.com/rudrakshb06)

## License

MIT License - see [LICENSE](LICENSE) for details.
