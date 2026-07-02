# ebpf_papers

A small, static, data-driven catalog for eBPF / kernel-extension research papers. No build step — it's just `index.html` + `style.css` + `script.js` reading `papers.json`.

## Running it locally

The site uses a custom Python server to enable auto-saving to disk.

1. Open `.env` and set your `ADMIN_TOKEN` (it defaults to `prince`).
2. Run the server:
```bash
cd ebpf_papers
python3 server.py 8080
```
3. The site will be available at `http://localhost:8080` (or `http://<your-network-ip>:8080` on your LAN).

## Adding / editing papers (Admin Mode)

By default, the site is **read-only** for everyone who visits it. To add, edit, or delete papers, you must access the site using your admin token in the URL:

**`http://localhost:8080/?admin=prince`** (Replace `prince` with whatever is in your `.env`)

When you visit with the correct token:
- The **+ add paper** and **{ } import JSON** buttons will appear.
- Every card will have **edit** and **delete** buttons.
- All changes you make are instantly and automatically saved to `papers.json` on disk! No need to manually export.

## Adding a paper by hand

Open `papers.json` and append an object to the array. Every field is optional except `title` — the site degrades gracefully if you leave things out, so you can add a bare-bones entry today and fill in classification later.

```json
{
  "id": "unique-slug-2025",
  "title": "Paper Title Here",
  "authors": ["First Last", "First Last"],
  "venue": "OSDI",
  "year": 2025,
  "links": {
    "paper": "https://...",
    "code": "https://...",
    "talk": "https://..."
  },
  "summary": "One or two sentences, in your own words, on what the paper does.",

  "primary_categories": ["Storage", "Operating Systems"],
  "secondary_categories": ["Filesystems"],
  "supporting_categories": ["Systems"],
  "application_domain": ["Storage"],
  "ebpf_mechanisms": ["kprobe", "struct_ops"],
  "system_layers": ["Kernel Subsystem"],
  "research_areas": ["Storage Systems"],
  "goals": ["Performance Optimization"],
  "deployment_type": ["In-Kernel"],
  "innovation_type": ["New eBPF Framework"],
  "kernel_subsystems": ["ext4"],
  "target_workloads": ["Key-value stores"],
  "target_resources": ["NVMe SSDs"],
  "performance_objectives": ["Lower latency"],

  "classification_reasoning": {
    "primary_categories": {
      "Storage": "why this tag applies, one sentence"
    }
  }
}
```

Notes:
- All the classification fields are arrays of short tag strings. Leave any of them out (or set to `[]`) if you haven't classified that paper yet.
- `classification_reasoning` is optional. If present, it's shown in each card's "more detail" panel, keyed by field name → tag value → one-sentence justification (matches the shape you get if you run a paper through an LLM classifier with these categories).
- Every field — including ones not used as sidebar filters — is indexed for full-text search, so it's still worth filling in even if it never becomes a clickable filter.

## Changing which fields are filterable

At the top of `script.js`:

```js
const FACET_FIELDS = [
  { key: "primary_categories", label: "Category" },
  { key: "research_areas", label: "Research Area" },
  { key: "application_domain", label: "Application Domain" },
  { key: "ebpf_mechanisms", label: "eBPF Mechanism" },
  { key: "deployment_type", label: "Deployment" },
  { key: "innovation_type", label: "Innovation Type" },
];
```

This is the sidebar's set of filter groups, kept short on purpose so the UI doesn't get overwhelming. Fields not listed here (`secondary_categories`, `goals`, `kernel_subsystems`, `target_workloads`, etc., listed in `DETAIL_FIELDS` right below) still show up as read-only tags in each card and are searchable — move a key from `DETAIL_FIELDS` to `FACET_FIELDS` (or vice versa) to change what's clickable in the sidebar. Facet option lists and counts are generated from whatever is actually in `papers.json`, so there's nothing else to update by hand.

## How filtering works

- Search is a plain case-insensitive substring match across title, authors, venue, year, summary, every tag field, and the reasoning text.
- Checking multiple boxes *within* one filter group is OR ("Storage" or "Networking").
- Checking boxes *across* groups is AND (must match the Category filter *and* the Deployment filter).
- The number next to each checkbox reflects how many papers would match if you added that filter on top of whatever else is currently selected — the same pattern you'd see on a shopping site's faceted search.

## Deploying

It's fully static, so any static host works — GitHub Pages is the obvious one, same as the reference site this was modeled after:

```bash
git init
git add .
git commit -m "eBPF papers catalog"
git branch -M main
git remote add origin git@github.com:<you>/ebpf-papers.git
git push -u origin main
# then enable Pages on the repo, serving from main
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | All styling (design tokens as CSS variables at the top) |
| `script.js` | Loads `papers.json`, renders filters/search/cards — no dependencies |
| `papers.json` | The data. This is the only file you'll usually touch. |
