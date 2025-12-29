# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flipbook JS is a JavaScript library that combines PDF.JS and Turn.JS to render PDFs as interactive booklets with turnable pages. This is a fork with fixes and usability improvements over the original, particularly focused on iOS compatibility and memory management.

## Project Structure

- **web/** - Main viewer application
  - `viewer.html` - Main HTML page with PDF.JS UI
  - `viewer.js` - Core PDF.JS viewer logic (large, minified, ~470KB)
  - `magazine.js` - Magazine/flipbook mode implementation
  - `debugger.js` - PDF.JS debugging utilities (FontInspector, Stepper, Stats)
  - `libs/` - jQuery 3.7.1
  - `locale/` - Localization files
  - `images/` - UI assets

- **build/** - PDF.JS library files
  - `pdf.js` - PDF.JS core library
  - `pdf.worker.js` - PDF.JS web worker for rendering

- **turnjs4/** - Turn.JS page-flipping library
  - `lib/turn.min.js` - Core page turning engine
  - `lib/zoom.min.js` - Desktop zoom functionality
  - `lib/pinch-zoom.umd.js` - Mobile pinch-to-zoom

- **index.html** - Root redirect that forwards to `web/viewer.html` with default PDF

## Key Architecture

### Magazine Mode System

The application has two viewing modes:
1. **Standard PDF.JS viewer** - Traditional scrolling PDF viewer
2. **Magazine mode** - Interactive flipbook with page-turning animations

Magazine mode (`magazine.js`) implements:
- **Page caching system** (`pageCache`) - Pre-renders PDF pages to canvas elements for smooth flipping
- **Preload queue** (`pageLoadQueue`, `processPageQueue()`) - Background loading of upcoming pages
- **Layout modes** - Single page or double-page spread based on viewport
- **Platform-specific handling**:
  - iOS: Aggressive cache clearing to prevent Safari memory leaks (see comments about "safari engine is dogshit")
  - Desktop: More generous caching (4 pages ahead) with zoom support
  - Mobile: Pinch-zoom via `pinch-zoom.umd.js`

### Rendering Pipeline

Pages are rendered using a multi-step quality approach:
1. Calculate base scale from container dimensions and A4 aspect ratio (1:1.414)
2. Apply quality multiplier via `getOptimalRenderScale()`:
   - iOS: 1.5x (memory constrained)
   - Desktop: 2.5-3x based on device memory and pixel ratio
3. Account for `devicePixelRatio` for high-DPI displays
4. Render to canvas with PDF.JS at calculated scale
5. Cache canvas for reuse during page turns

### URL Parameters

The viewer accepts hash parameters:
- `file=<path>` - PDF file to load
- `magazineMode=true` - Auto-start magazine mode on load
- `allow_download=true` - Show download button
- `backgroundColor=<color>` - Override background color
- `single=true` - Force single-page layout

Example: `web/viewer.html?file=document.pdf&magazineMode=true&allow_download=true`

## iOS/Safari Specific Considerations

The codebase contains multiple iOS-specific workarounds due to Safari's memory management issues:

1. **Cache clearing** (`renderPageToCache:193-204`) - Deletes all cached pages except current ±1 when rendering on iOS
2. **No preloading** (`preloadPages:114-116`) - Disables background page loading on iOS
3. **Reduced quality** (`getOptimalRenderScale:329-331`) - Uses 1.5x multiplier instead of 2.5-3x
4. Platform detection: `/iPad|iPhone|iPod/.test(navigator.userAgent)`

## Development Notes

### Testing Locally

This project is hosted in a Docker container and accessible at:
```
http://direct.localhost/flipbook-js/web/viewer.html?file=Talyllyn-News-288.pdf&magazineMode=true&allow_download=true
```

Alternatively, open `index.html` in a web browser or serve via local HTTP server. The default configuration redirects to `web/viewer.html?file=compressed.tracemonkey-pldi-09.pdf&allow_download=true&magazineMode=true`

### Modifying Magazine Behavior

Core magazine logic is in `web/magazine.js`:
- `MagazineView.start()` - Initializes magazine mode
- `MagazineView.destroy()` - Returns to standard viewer
- `preloadPages()` - Controls background page loading
- `renderPageToCache()` - Canvas rendering with quality settings
- `fixPageAspectRatio()` - Maintains A4 proportions

### Canvas Rendering Quality

The rendering system uses three scaling factors:
- `baseScale` - Fits page to container
- `QUALITY_MULTIPLIER` - Platform-dependent quality boost
- `pixelRatio` - Device pixel density (window.devicePixelRatio)

Final canvas dimensions: `viewport × QUALITY_MULTIPLIER × pixelRatio`

### Turn.JS Integration

Magazine uses Turn.JS callbacks:
- `missing` - Loads pages not yet added to the flipbook
- `turning` - Checks page readiness before turn animation
- `turned` - Triggers preloading after page turn completes

### Memory Management

When modifying caching logic, be aware:
- Desktop can cache ~10-20 pages comfortably
- iOS requires aggressive cache eviction (keep only 3 pages)
- Each canvas stores full-resolution bitmap (~2-10MB per page depending on quality settings)
- Page cache is cleared on `destroy()` to free memory when exiting magazine mode
