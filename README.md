# Ski Map Configurator

A helper app for **Ski Resort Tycoon** that lets you configure ski mountain slots by drawing on a picture of the mountain. You can place **lifts** (bottom and top station) and **slopes** (curved lines with difficulty) and export everything to a JSON config file.

## Quick start

```bash
npm install
npm run dev
```

Open the app in your browser, then:

1. **Upload a mountain image** (any PNG/JPG of your ski area).
2. **Lifts**: Choose **Lift** mode, click the bottom station, then the top station. A line is drawn and the lift is stored.
3. **Slopes**: Choose **Slope** mode, pick a difficulty (green / blue / red / black), then click along the slope path. **Double-click** to finish the slope.

Use **Export config JSON** to save your configuration, or **Import config** to load a previous one.

## Config JSON format

Exported file: `ski-map-config.json`

- **imageWidth** / **imageHeight**: Original image dimensions (for coordinate scaling).
- **lifts**: Array of lifts. Each lift has:
  - `bottomStation`: `{ x, y }` — normalized coordinates (0–1) relative to image size.
  - `topStation`: `{ x, y }` — same.
- **slopes**: Array of slopes. Each slope has:
  - `difficulty`: `"green"` | `"blue"` | `"red"` | `"black"`.
  - `points`: Array of `{ x, y }` — normalized coordinates (0–1) along the slope path.

Example:

```json
{
  "imageWidth": 1920,
  "imageHeight": 1080,
  "lifts": [
    { "bottomStation": { "x": 0.2, "y": 0.8 }, "topStation": { "x": 0.25, "y": 0.3 } }
  ],
  "slopes": [
    {
      "difficulty": "blue",
      "points": [
        { "x": 0.25, "y": 0.32 },
        { "x": 0.3, "y": 0.5 },
        { "x": 0.22, "y": 0.78 }
      ]
    }
  ]
}
```

Coordinates are normalized so the same config works regardless of how the image is displayed or scaled in your game.
