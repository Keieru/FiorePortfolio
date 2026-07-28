# Fiorella Ailen Litarelli — Portfolio

Single-page portfolio site for Fiorella Ailen Litarelli, psicóloga colegiada (M-45324, COPM). Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com).

## Getting started

```sh
npm install
npm run dev
```

The site runs at `http://localhost:4321`.

## Commands

| Command             | Action                                       |
| :------------------ | :-------------------------------------------- |
| `npm install`        | Install dependencies                          |
| `npm run dev`         | Start the local dev server                    |
| `npm run build`       | Build the production site to `./dist/`        |
| `npm run preview`     | Preview the production build locally          |
| `npm run astro ...`   | Run Astro CLI commands (e.g. `astro check`)   |

## Project structure

```text
/
├── public/
│   └── images/            # Photos, Formspree/QR assets
└── src/
    ├── data/
    │   └── profile.ts     # Content: pillars, credentials, experience
    ├── layouts/
    │   └── Layout.astro   # HTML shell, shared <head>
    ├── pages/
    │   └── index.astro    # The single page
    └── styles/
        ├── classes.ts     # Shared Tailwind class-name constants
        └── global.css     # Tailwind entrypoint + design-token @theme
```

Page content (data) and reusable Tailwind class strings are kept out of `index.astro` — add new content to `src/data/profile.ts` and new shared styling to `src/styles/classes.ts` rather than inlining either in the page.

## Contact form

The contact form posts to [Formspree](https://formspree.io) via `fetch`; see the `<script>` block at the bottom of `src/pages/index.astro`.
