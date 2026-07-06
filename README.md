# eBPF Papers Catalog

A small, lightweight, data-driven catalog for eBPF and kernel-extension research papers. 

This project uses a simple frontend (`index.html`, `style.css`, `script.js`) that reads from a `papers.json` database. It features a custom Python server that enables an "Admin Mode" for auto-saving edits directly from the web interface back to the JSON file.

## Features
- **Fast & Static**: Instant loading with no frontend build steps.
- **Rich Filtering & Search**: Case-insensitive search across all fields (title, authors, summary, tags) and multi-select faceted filtering.
- **Admin Dashboard**: A hidden authenticated mode that lets you add, edit, and delete papers directly from the UI.
- **Docker Ready**: Easy to deploy anywhere.

---

## 🚀 How to Run Locally

### Using Docker (Recommended)
1. Build the image:
   ```bash
   docker build -t ebpf-papers .
   ```
2. Run the container:
   ```bash
   docker run -d -p 8080:8080 -v $(pwd)/papers.json:/app/papers.json -v $(pwd)/.env:/app/.env --name ebpf-website ebpf-papers
   ```
3. Visit `http://localhost:8080` in your browser.

### Using Python Natively
1. Open `.env` and set your `ADMIN_TOKEN` (e.g., `ADMIN_TOKEN=my_secret_password`).
2. Start the server:
   ```bash
   python3 server.py 8080
   ```
3. Visit `http://localhost:8080`.

---

## 📝 How to Add or Edit Papers

By default, the site is **read-only** to protect your data. There are two ways to add new papers:

### Method 1: Using the Web Admin UI (Easiest)
1. Go to your live website and add your admin token to the URL like this:
   **`http://localhost:8080/?admin=YOUR_ADMIN_TOKEN`**
2. The UI will unlock! You will now see:
   - A **"+ Add Paper"** button at the top.
   - An **"Import JSON"** button.
   - **Edit** and **Delete** buttons on every single paper card.
3. Simply click "+ Add Paper", fill out the form, and click Save. 
*Note: The Python server will automatically write your changes permanently to `papers.json`.*

### Method 2: Manually via JSON
You can bypass the UI and add papers directly by opening `papers.json` in a text editor and appending a new JSON object to the array. 

Here is a template:
```json
{
  "id": "unique-slug-2025",
  "title": "Paper Title Here",
  "authors": ["First Last", "First Last"],
  "venue": "OSDI",
  "year": 2025,
  "links": {
    "paper": "https://...",
    "code": "https://..."
  },
  "summary": "One or two sentences on what the paper does.",
  "primary_categories": ["Storage", "Networking"],
  "ebpf_mechanisms": ["kprobe"]
}
```
*Note: Every field except `title` is optional. The site degrades gracefully if you leave fields out.*

---

## ⚙️ Customizing the Filters
If you want to change which tags appear in the left-hand sidebar filters, open `script.js` and modify the `FACET_FIELDS` array at the top of the file:
```js
const FACET_FIELDS = [
  { key: "primary_categories", label: "Category" },
  { key: "ebpf_mechanisms", label: "eBPF Mechanism" },
];
```
Any field not listed here will still show up as a tag on the paper cards and remain searchable, but it won't clutter the sidebar.

---

## ☁️ Deployment

### 1. AWS EC2 (Best for Admin UI)
You can deploy this as a Docker container on a free-tier AWS EC2 instance. Because `papers.json` is mapped to the EC2 hard drive, all edits made via the web UI will be saved safely.

### 2. GitHub Pages (Read-Only)
If you just want a free public catalog and don't care about the web Admin UI, you can host the repository on GitHub Pages. 
* Because GitHub Pages only hosts static files, the Python server won't run.
* Visitors can view and filter papers, but the `+ Add Paper` button will not work. You must edit `papers.json` manually and `git push` to update the site.
