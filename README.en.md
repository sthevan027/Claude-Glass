# Claude Glass

**English** · [Português](README.md)

> **Note:** the app's interface is in Brazilian Portuguese. This README is
> translated; the UI is not.

A desktop widget that shows how much of your Claude limit you've already used,
with a pixel-art pet that reacts to what Claude Code is doing.

---

## What it is

A floating, translucent widget that sits in the corner of your screen. It reads
Claude Code's local logs and shows:

- how many tokens you've spent in the current 5-hour session and over the last 7 days
- how much of your limit that represents (as a percentage, once you connect your account)
- usage per model over 7 days, plus a 30-day heat map
- a pet that sleeps when you stop, works when Claude works, and catches fire
  when usage crosses a threshold you choose

Windows 10/11. Requires [Claude Code](https://claude.com/claude-code) — that's
where the data comes from.

## Installation

**Option 1 — grab the build**

1. Go to [Releases](https://github.com/vitoriahellen/Claude-Glass/releases)
2. Download the `.zip` and extract it wherever you like
3. Run `Claude Glass.exe`

Windows may show "Windows protected your PC" because the executable isn't
signed. Click **More info → Run anyway**.

**Option 2 — run from source**

```bash
git clone https://github.com/vitoriahellen/Claude-Glass.git
cd Claude-Glass
npm install
npm start
```

To build your own executable:

```bash
npm run dist:win
```

Output lands in `dist/win-unpacked/Claude Glass.exe`, plus a `.zip` in `dist/`.

## Connecting your account (optional)

Without connecting, the widget already shows the **exact token counts** from
your own logs. Connecting adds the **real percentage of your limit**, straight
from Anthropic's API.

1. Click the gear ⚙
2. **Entrar pelo navegador** ("sign in via browser") — opens `claude.ai`
3. Log in and copy the code the page shows
4. Paste it into the field and click **Conectar** ("connect")

## Security and your token

Read this before connecting. It's deliberately blunt.

**What's safe**

- **Your password never touches the app.** Login is OAuth with PKCE: you type
  your password on `claude.ai`, in your own browser. The app only ever receives
  a single-use authorization code.
- **No third-party servers.** The app talks only to `claude.ai`,
  `platform.claude.com` and `api.anthropic.com`. No telemetry.
- **The token never enters the repository.** It's written to
  `%USERPROFILE%\.claude-usage-monitor\auth.json`, outside the project folder.

**What you should know**

- **File permissions don't protect it on Windows.** The code writes the token
  with `mode: 0o600`, but on Windows Node only flips the read-only attribute —
  it creates no ACL. Any process running as your user can read it.
- **The token can do more than this app uses.** The requested scope is
  `org:create_api_key user:profile user:inference`. The widget only reads your
  profile, but the stored token authorizes **creating an API key on your
  organization**. If the file leaks, someone can mint a key billed to your account.
- **The app identifies itself as Claude Code.** It uses the official CLI's
  public `client_id` and User-Agent. This is not a registered third-party
  integration: Anthropic may block it without notice, and it likely violates the
  terms of service. On a corporate account, talk to whoever administers your
  organization first.
- **The estimated percentages aren't official.** Without a connected account,
  the percentage comes from hand-calibrated budgets in `usage.js` that Anthropic
  does not publish. They can drift from the real dashboard. The **token counts**
  are exact.

**Revoking**

**Desconectar** ("disconnect") deletes the local file. To revoke for real — if
you suspect a leak — use your Anthropic account settings.

## Settings

Open with the gear ⚙.

| Option | What it does |
|---|---|
| Iniciar com o Windows | Launches the widget at startup. On by default. |
| Alertas | Notification when the session or week crosses each threshold |
| Limites de alerta (%) | The two levels that trigger a notification |
| Pegar fogo em (%) | Usage level at which the pet catches fire |

## Tray icon

Claude Glass keeps a small icon in the system tray, which changes color with
activity — lit up while Claude Code is working, gray while idle. Click it to
bring the widget back to the front.

Clicking the widget's **×** only hides it (it keeps running in the tray, same
as Slack/Discord). To actually quit, right-click the tray icon and choose
**Sair** (Exit).

## Uninstalling

The app has no installer, so it won't appear under "Add or remove programs".

1. **Uncheck "Iniciar com o Windows"** in Settings before deleting anything,
   or the startup entry is left orphaned. If you already deleted it, remove the
   shortcut from `Win+R` → `shell:startup`.
2. Right-click the tray icon and choose **Sair** (the widget's **×** only
   hides it — it doesn't end the process)
3. Delete the folder you extracted the app into
4. Delete the data: `%USERPROFILE%\.claude-usage-monitor` (the token) and
   `%USERPROFILE%\.claude-glass` (your settings)

## How it works

Claude Code writes one `.jsonl` per session under `~/.claude/projects`. The
widget reads those files, sums tokens over a 5-hour window and over 7 days, and
watches the most recently touched file to infer what Claude is doing right now
(reading, editing, running a command, planning) — that's what drives the pet's
animation.

Once you connect your account, the percentage comes from Anthropic's usage
endpoint instead of the estimated budgets.

## Known limitations

- **Windows only.** Packaging and auto-start are platform-specific.
- **The percentage without login is an estimate.** See the security section.
- **The 5-hour window is inferred**, not read from the API — it can drift from
  the official dashboard by a few minutes.
- **The executable is unsigned**, so SmartScreen complains on first run.

## Development

```bash
npm start          # dev mode
npm test           # bridge parity + click smoke test
npm run dist:win   # package
```

| File | Responsibility |
|---|---|
| `main.js` | main process, window, IPC, notifications |
| `preload.js` | bridge between main and renderer (`contextBridge`) |
| `usage.js` | reads the `.jsonl` files; computes tokens, session, activity |
| `auth.js` | OAuth PKCE plus the usage and profile endpoints |
| `renderer/` | UI: `index.html`, `pet.js`, `style.css` |

`npm test` includes a parity check between `preload.js` and the renderer. It
exists because a single missing bridge method takes down all of `pet.js` on
first use and kills every button at once — with no visible error on screen.

## License

MIT — see [LICENSE](LICENSE).
