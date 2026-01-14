# Iran Memorial

Interactive, open-source memorial website dedicated to commemorating individuals in Iran who lost their lives during the revolution.

## Features
- Responsive, vector-based map interface with interactive red markers
- Click a marker to view biography, date/location, media, and testimonials
- Search and filtering by name, city, and year
- Accessibility-first design meeting WCAG 2.1 AA principles
- Privacy-friendly: no analytics, no tracking, no cookies
- Multilingual support (Persian and English)
- Admin submission tool generating validated JSON for moderated entries

## Tech Stack
- HTML5, CSS3, TypeScript, Vite
- Leaflet.js for interactive mapping
- Static JSON data model stored in `public/data/memorials.json`

## Getting Started
```bash
npm install
npm run dev
```
Open the local URL shown and visit `/admin.html` for the submission tool.

## Data Schema
Memorial entries follow this shape:
```json
{
  "id": "unique-id",
  "name": "Full Name",
  "city": "City",
  "location": "City, Iran",
  "date": "YYYY-MM-DD",
  "coords": { "lat": 35.6892, "lon": 51.3890 },
  "bio": "Optional biography",
  "testimonials": ["Optional testimonial lines"],
  "media": { "photo": "/path.jpg", "video": "/path.mp4" }
}
```

## Accessibility
- Keyboard accessible markers and detail panel
- Sufficient color contrast and focus indicators
- Semantic landmarks (header, main, aside, footer) and ARIA labels

## Privacy
See `public/privacy.html`. No trackers or cookies. Content is community-moderated; open an issue for corrections or removals.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Issues and PRs welcome.

## CI/CD
Pushes to `main` trigger build and deployment to GitHub Pages via Actions (`.github/workflows/deploy.yml`).

## License
MIT. See [LICENSE](LICENSE).
