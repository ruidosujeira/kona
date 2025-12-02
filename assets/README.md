# Assets

This directory contains media assets for the README.

## Required Files

### `demo.gif`

A GIF showing Kona's speed advantage. Should demonstrate:

1. **Split screen comparison**
   - Left: Webpack starting (slow, 2-3 seconds)
   - Right: Kona starting (instant, ~50ms)

2. **Recommended recording setup**
   - Terminal with dark theme
   - Clear, readable font (16px+)
   - 800x400px or similar aspect ratio
   - 15-20 seconds max

3. **Script to record**

```bash
# Terminal 1 (Webpack)
cd webpack-project
npm run dev
# Wait for "Ready in 2847ms"

# Terminal 2 (Kona)
cd kona-project
npm run dev
# Shows "Ready in 47ms" almost instantly
```

4. **Tools to create**
   - [asciinema](https://asciinema.org/) + [agg](https://github.com/asciinema/agg)
   - [Gifski](https://gif.ski/)
   - [LICEcap](https://www.cockos.com/licecap/)
   - QuickTime + ffmpeg

### Recording commands

```bash
# Using asciinema
asciinema rec demo.cast

# Convert to GIF
agg demo.cast demo.gif --cols 100 --rows 30

# Or use ffmpeg for screen recording
ffmpeg -i screen.mov -vf "fps=15,scale=800:-1" -loop 0 demo.gif
```

## Placeholder

Until the real GIF is created, the README will show a broken image. Create `demo.gif` to fix this.
