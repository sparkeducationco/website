# Spark — Field of Light

Original homepage art generated using the built-in image-generation tool. The brief is retained below for future matching artwork. The production asset is `spark-field.webp` (1536 × 1024), converted from the original PNG with cwebp. No content edits were made during conversion.

## Visual direction

Solar yellow, near-black ink and warm paper. Oversized condensed typography, finely engraved landscapes and geometric apertures. A visual metaphor for curiosity and a clear path through a complex world. Avoid fabricated dashboards and technical implementation diagrams.

## Generation prompt

Use case: stylized-concept
Asset type: original landscape artwork for Spark Filter, a school browser-protection company's bold new homepage. Artwork ONLY, not a website mockup.
Primary request: An extraordinary, confident two-ink copperplate engraving / screenprinted science-fiction landscape, a visual metaphor for a clear path through the complexity of the internet.
Scene: Monumental densely crosshatched black ridges and finely engraved curving contour lines create a surreal terrain of information. A tall thin rectangular aperture stands at center-right on a ridge, opening to a brilliant small sun. One sharp wedge of luminous yellow light travels from the aperture down across the tangled landscape to the lower foreground. A field of ink-black finely etched concentric arcs radiates from the sun. A little surreal, intellectually curious, architecturally precise, physically tactile.
Composition: wide landscape 3:2. Artwork extends edge to edge. Aperture at two-thirds from left, top half. Intricate dark topographical terrain covers the bottom half, with sunburst and luminous negative space above. Strong purposeful composition, large beautiful geometric shapes and very fine linework. Must remain arresting when cropped to a portrait on right half of a webpage. No text overlay inside image.
Style: handmade antique scientific etching meets contemporary avant-garde music poster; dry black ink, moire, fine stippling, slightly imperfect registration, visible ivory paper fiber. Bold, gorgeous, collectible print. Flat two-color analog reproduction. Absolutely no glossy 3D gradients.
Palette: strictly near-black #141510 and intense warm solar yellow #f7df48, a little pale yellow paper. No green, no brown, no orange.
Constraints: no writing, letters, numbers, branding, people, locks, shields, computers, circuit board graphics, stock cybersecurity symbolism, cartoon school items, floating spheres, or watermarks. This is art with a clear distinctive concept, not clipart.

## Implementation

Shared site styles live in `../site.css`, with interior-page layouts in `../pages.css`, independently of legacy page styles. Fonts are locally hosted under `fonts/` with OFL licenses.

Motion is managed in `../site-motion.js`: staggered entrances, one-time section reveals, subtle artwork parallax, and locally bundled Lenis wheel easing on fine-pointer desktop devices. Frames run only during scrolling/input, with no continuous animation loop. Touch scrolling is native. Reduced-motion preferences disable the effects, including when changed live. `../site.js` retains menu behavior and pointer depth.
