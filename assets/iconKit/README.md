# OuiShare app icon — production set

The mark: a disc split by an S-shaped seam ("one thing, divided fairly"),
contained by an ink ring. The ring is the O, the seam is the S — OuiShare.

Colors: cream #F2EDE4 · cobalt #3E63E0 · coral #E8613C · ink #262B3D

## Files

| File | Purpose |
|---|---|
| master.svg | Source of truth. Full-bleed square — no rounded corners (the OS applies its own mask). Edit this, re-export everything else. |
| icon-1024.png | Expo `icon` / iOS App Store. Opaque, as iOS requires. |
| icon-512.png | Google Play Store listing asset. |
| icon-180.png / icon-96.png / icon-48.png | Apple touch icon, PWA, favicon. |
| adaptive-foreground.svg / -1024.png | Android adaptive foreground: transparent, mark sized to the ~61% safe zone so no launcher shape crops it. |
| adaptive-monochrome.svg / -1024.png | Android 13+ themed-icon layer (system tints it to the wallpaper). |

The adaptive background is a solid color — supply it via config, no image needed.

## Expo wiring (app.json)

```json
{
  "expo": {
    "icon": "./assets/icon-1024.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-foreground-1024.png",
        "monochromeImage": "./assets/adaptive-monochrome-1024.png",
        "backgroundColor": "#F2EDE4"
      }
    },
    "web": { "favicon": "./assets/icon-48.png" }
  }
}
```

Expo generates the full iOS/Android size ladders from these at build time.
Rebuild with `eas build` (or `npx expo prebuild --clean` for bare) to see it
on device — icon changes don't show up through a simple JS update.

## Regenerating after edits

```bash
pip install cairosvg
python3 -c "import cairosvg; cairosvg.svg2png(url='master.svg', write_to='icon-1024.png', output_width=1024, output_height=1024)"
```
