# DRC Observatory — Authoritative Astronomical Sources & Credits

This directory contains the authoritative catalog sources used by `scripts/generate-constellations.mjs` to compile the DRC Observatory celestial atlas.

## Datasets & Provenance

1. **d3-celestial (Olaf Frohn)**
   - Files: `constellations.json`, `constellations.lines.json`, `starnames.json`, `stars.6.json`, `messier.json`
   - Repository: https://github.com/ofrohn/d3-celestial
   - License: BSD 3-Clause License (Copyright 2015 Olaf Frohn)
   - Scope:
     - 88 canonical IAU constellation definitions and stick-figure polylines.
     - 5,044 naked-eye stars down to visual magnitude $V_{\text{mag}} \le 6.0$ from the Hipparcos Catalog (ESA 1997 / van Leeuwen 2007) and Yale Bright Star Catalog (BSC5).
     - 110 Messier deep-sky objects with coordinates and morphology.

2. **IAU Catalog of Star Names (IAU-CSN)**
   - File: `IAU-CSN.txt`
   - Source: IAU Working Group on Star Names (WGSN), Susanne Hoffmann & Eric Mamajek
   - URL: https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
   - Official IAU Portal: https://www.iau.org/public/themes/naming_stars/
   - License: Creative Commons Attribution (CC BY)
   - Scope: Officially recognized proper names for stars (e.g., Sirius, Betelgeuse, Rigel, Vega, Aldebaran, Antares, Albireo).

3. **Hipparcos (HIP) & Yale Bright Star Catalog (BSC5)**
   - Astrometry: High-precision J2000.0 Right Ascension, Declination, Parallax ($\varpi$), and Johnson $B-V$ color indices.
   - License: Public Domain / Open Academic Access.
