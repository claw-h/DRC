---
id: "cordry-2023-metric-tensors-parallax"
title: "Metric Tensors and Systematic Parallax Drift in Deep-Sky Catalogs"
subtitle: "Reconciling Tycho-2, Gaia DR3, and Historical Glass-Plate Astrographs"
year: 2023
venue: "Monthly Notices of the Royal Astronomical Society"
volumeIssue: "Vol. 521, Issue 4, pp. 4890–4918"
coAuthors:
  - "H. K. Takahashi"
abstract: "Century-scale proper motion baselines require stitching modern space-borne CCD astrometry to 19th- and 20th-century photographic glass plates (the Carte du Ciel and Palomar Sky Survey). We demonstrate that radially symmetric polynomial plate constants fail to capture emulsion shear and atmospheric refraction gradients, introducing a coherent 0.18 mas/yr quadrupole warp across the northern hemisphere."
doi: "https://doi.org/10.1093/mnras/stad812"
pdfUrl: "/cv"
citationBibtex: |
  @article{cordry2023metric,
    author  = {Cordry, Duncan R. and Takahashi, H. K.},
    title   = {Metric Tensors and Systematic Parallax Drift in Deep-Sky Catalogs},
    journal = {Monthly Notices of the Royal Astronomical Society},
    year    = {2023},
    volume  = {521},
    number  = {4},
    pages   = {4890--4918},
    doi     = {10.1093/mnras/stad812}
  }
sections:
  - id: "sec-plates"
    heading: "§1 · Glass-Plate Emulsion Creep & Refraction"
    body: "Between 1887 and 1958, observatory astrographs recorded millions of stellar positions on silver-halide gelatin plates exposed over multi-hour sidereal tracks [1]. Over decades of archival storage in vertical cabinets, gravitational creep of the gelatin layer induces a non-affine vertical shear field that mimics secular proper motion toward the celestial poles."
  - id: "sec-harmonic"
    heading: "§2 · Vector Spherical Harmonic Decomposition"
    body: "By expanding the residual displacement field between digitized Carte du Ciel plates and Gaia DR3 quasar anchors in vector spherical harmonics up to degree l = 16, we isolate the mechanical gelatin deformation mode from genuine galactic rotation signatures [2]."
  - id: "sec-recalibration"
    heading: "§3 · Recalibrated Century Baselines"
    body: "Our open-source plate-reduction kernel reduces systematic proper-motion bias by 74% across 14,200 reference stars, resolving long-standing discrepancies in binary orbital elements."
references:
  - num: 1
    citation: "Bessel, F. W. (1838). Bestimmung der Entfernung des 61sten Sterns des Schwans. Astronomische Nachrichten, 16(5), 65–96."
    note: "First rigorous heliometer parallax reduction accounting for thermal instrument flexure."
  - num: 2
    citation: "Lindegren, L. et al. (2021). Gaia Early Data Release 3: The astrometric solution. Astronomy & Astrophysics, 649, A2."
    doiUrl: "https://doi.org/10.1051/0004-6361/202039709"
    note: "Defines the celestial reference frame spin and magnitude-dependent calibration terms."
---
