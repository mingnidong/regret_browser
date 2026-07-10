# Regret Browser
A local-first browser extension that predicts whether a webpage is worth your attention.

Regret Browser is a Chrome extension that estimates the risk that an article, video page, or post will be shallow, repetitive, manipulative, or distracting. It gives a transparent 0–100 Regret Score, explains the signals behind it, and adapts to simple feedback without sending browsing data to a server.

## Why it exists

Clicks are cheap, but attention is not. Search results and social feeds frequently reward inflated headlines, SEO filler, outrage, and repetition. Regret Browser provides a quick second opinion while preserving the user's ability to decide. BTW this is a heuristic tool, not an AI model or a truth detector. Every score comes from deterministic, inspectable rules. Created after seeing neighbors repeatedly waste hours on clickbaity articles.

## Features

- Privacy-conscious extraction of visible page content and metadata
- Six explainable risk dimensions and a weighted overall score
- Feedback for worth-it, shallow, ragebait, distracting, and duplicate pages
- Local source history and title/topic similarity learning
- Optional unobtrusive page badge
- Detailed report with phrases, repetition, related history, and domain statistics
- Hidden-domain controls, sensitivity settings, saved pages, and JSON import/export
- No backend, paid API, account, telemetry, or external model

## Privacy model

All analysis runs inside the extension. Page snapshots, reports, settings, and feedback are stored only in `chrome.storage.local`.
The content script reads visible page text and metadata. It deliberately excludes form controls, password fields, editable regions, hidden elements, scripts, styles, navigation, and common dialog/checkout/account areas. Regret Browser does not transmit page content anywhere.
The extension requests access to HTTP and HTTPS pages because analysis and the optional badge must run on the page being evaluated. Chrome-internal pages and other restricted URLs cannot be analyzed.

## Install from a release build

1. Download or clone this repository.
2. Run `npm install`.
3. Run `npm run build`.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the generated `dist` directory.
7. Pin Regret Browser and open its popup on a normal webpage.

## Development

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Load the generated development extension directory shown by Vite/CRXJS. Changes are rebuilt automatically.

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Architecture

```text
src/
  background/     Service worker and extension coordination
  content/        Privacy-safe DOM extraction and optional page badge
  popup/          Active-page score and feedback UI
  options/        Settings and local-data management
  report/         Detailed analysis report
  ui/             Shared React components and visual system
  lib/
    analyzer/     Pure, deterministic scoring logic
    storage/      Typed chrome.storage.local repository
    text/         Normalization, matching, similarity, repetition
    types/        Shared contracts
```

The popup asks the background service worker to analyze the active tab. The worker obtains a typed snapshot from the content script, loads local settings/history, runs the pure analyzer, caches the result locally, and returns it. UI code never scores pages directly, which keeps the model independently testable.

## Scoring model

Every dimension is a **risk score**, so a higher number always means more concern:

- **Clickbait (20%)** — curiosity gaps, listicle framing, inflated promises, title punctuation
- **Information density (22%)** — sparse/short text, filler, weak title-to-body overlap, thin paragraphs
- **Novelty (16%)** — internal repetition and similarity to previously regretted topics
- **Emotional manipulation (15%)** — outrage, fear, urgency, and excessive emotional/hype language
- **Distraction risk (15%)** — unusually link-heavy pages, short-content inflation, and distracting framing
- **Source history (12%)** — the user's own worth-it versus regretted feedback for the domain

The weighted result is adjusted slightly by low/medium/high sensitivity and clamped to 0–100.

| Score | Label |
| --- | --- |
| 0–25 | Worth it |
| 26–50 | Mixed |
| 51–75 | Low-signal |
| 76–100 | High regret risk |

Feedback never retrains a hidden model. The extension stores normalized title terms and bounded domain aggregates. Similar regretted titles raise novelty/distraction risk; worth-it history reduces source risk. Hiding a domain suppresses warnings and the badge for that domain.

## Data export

The options page exports a versioned JSON file containing settings, feedback, domain aggregates, fingerprints, and saved pages. Imports are schema-validated before replacing local user data. Reports are intentionally omitted because they can be regenerated and may contain larger excerpts.

## Limitations

- Heuristics can be wrong and should not be treated as factual quality judgments.
- Dynamic, paywalled, image-heavy, non-English, and very short pages provide less evidence.
- Publication dates and article boundaries depend on publisher markup.
- The MVP does not analyze audio/video content, comments, images, PDFs, or content inside cross-origin frames.
- Language patterns are currently optimized for English.
- Browser storage is local to the Chrome profile unless the user explicitly exports it.

## Roadmap

- User-tunable dimension weights and phrase dictionaries
- Better multilingual rules
- On-device semantic embeddings when browser support and size permit
- Optional pre-click link previews with explicit site permission
- Accessibility and extraction improvements for complex web applications
- Automated end-to-end extension tests


