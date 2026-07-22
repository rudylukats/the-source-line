# Logo files

The Source Line mark is a stacked "SL" monogram cut by a single vertical seam at
the centre. Everything left of the seam is amber (`#e8a33d`), everything right of
it is off-white (`#f5f5f5`). The letterforms are real vector outlines drawn from
DejaVu Serif Bold, not live text, so they render identically no matter what fonts
a visitor has installed.

Background colour is `#0b0b0c`, the same as the site.

## What each file is for

`logo-mark.svg` is the primary mark on a transparent background. Use this
anywhere you need the logo over an existing background. This is the master file,
regenerate the others from it if anything changes.

`logo-mark-dark.svg` is the same mark on a rounded dark square. Use it where the
logo needs its own container.

`logo-mark-1024.png` is a raster export of the above at 1024px, for anything that
will not take an SVG.

`logo-s.svg` is the S on its own, transparent, with the identical split. This is
the small-size version of the brand.

`favicon-s.svg` is the S on a rounded dark square. This matches what is embedded
as a data URI in `app/index.html`, kept here as a readable reference copy.

`avatar-sl.svg` and `avatar-sl-1000.png` are the full mark on a square with no
rounded corners, sized for social profile pictures.

`avatar-s.svg` and `avatar-s-1000.png` are the S-only equivalent.

## Why there are two versions

Two stacked serif letters need roughly 32px to stay legible. Below that they
collapse into a smudge. So anywhere the mark renders small, use the S on its own.
That covers the browser favicon at 16px and social avatars, which platforms shrink
to about 40px in feeds. The full stacked mark is for the site header, the
apple-touch-icon, and anything print or large.

Both versions share the same seam, the same colours, and the same typeface, so
they read as the same brand.

## Regenerating

The vector paths live in two places, `MARK_S` and `MARK_L` in `src/App.tsx` for
the header, and URL-encoded data URIs in `app/index.html` for the icons. If you
change the mark, update all three plus the files in this folder so they do not
drift apart.
