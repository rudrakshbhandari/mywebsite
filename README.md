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
- **Vercel** - Hosting with Speed Insights monitoring

## Project Structure

```
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # Custom CSS with animations
├── js/
│   ├── main.js         # Core functionality
│   ├── animations.js   # Scroll and interaction animations
│   ├── config.js       # Configuration settings
│   ├── health.js       # Health dashboard logic
│   ├── analytics.js    # Event tracking hooks
│   └── speed-insights.js
├── img/                # Favicons, profile photos, project images
├── scripts/            # Utility scripts
├── CHANGELOG.md        # Release notes and change history
├── vercel.json         # Deployment configuration
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

### Tracked Events

The site emits the following events through `js/analytics.js`:

- `portfolio_page_view`
- `health_page_view`
- `resume_click`
- `contact_email_click`
- `social_click` (includes `network` payload)
- `health_nav_click`

### Where to View Data

- Vercel dashboard → Project → **Analytics** for visitor/page-view metrics and routes.
- Vercel dashboard → Project → **Speed Insights** for performance telemetry.

### Validation Checklist

1. Open the production site in an incognito window.
2. Open DevTools → Network and confirm:
   - `/_vercel/insights/script.js` returns `200`
   - `/_vercel/speed-insights/script.js` returns `200`
3. Trigger a few actions (open `/health`, click résumé, click social links).
4. Wait 1-2 minutes and refresh the Vercel Analytics dashboard.

## Health Data Pipeline

- Health data is written to `oura_public.json` by `.github/workflows/oura-update.yml`.
- The workflow runs every 15 minutes (`*/15 * * * *`) and commits only when data changes.
- Public data includes daily aggregates plus a downsampled intraday heart-rate series for charting on `/health`.

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
