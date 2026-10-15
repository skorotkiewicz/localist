# Localist

Edit `src/`, `public/`, and `index.html` once. Web and Tauri use the same frontend.

Vite selects the platform adapter at build time:

- `platform/web.js`: HTTP storage and browser downloads.
- `tauri/platform.js`: Tauri `invoke` calls to the existing Rust commands.

No runtime platform detection or mock IPC is used.

## Run

- Web: `bun run dev` from this directory. Keep its local server running while editing.
- Desktop: `bun run tauri dev` from `tauri/`.
- Tests: `bun run test` here, or in `tauri/` to also run the Rust tests.
- Builds: `bun run build` here for web; `bun run tauri build` in `tauri/` for desktop.

Install the existing dependencies with `bun install` in both directories when setting up a fresh checkout. The desktop folder requires its parent project.

## Data

Web data remains in `data/projects.json`. Desktop data remains in the application's data folder, usually `~/.local/share/com.mod.localist/projects.json` on Linux. Desktop exports go to Downloads. No data is moved between versions automatically.
