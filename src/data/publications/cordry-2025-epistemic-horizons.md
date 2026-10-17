---
id: "cordry-2025-epistemic-horizons"
title: "Epistemic Horizons in Interferometric Astrometry"
subtitle: "Coordinate Invariance Under Sub-Milliarcsecond Baseline Perturbations"
year: 2025
venue: "The Astrophysical Journal"
volumeIssue: "Vol. 964, No. 2, pp. 112–148"
coAuthors:
  - "E. V. Lindqvist"
  - "S. Narayanan"
abstract: "We establish a formal equivalence between instrumental phase-closure uncertainty in very-long-baseline interferometry (VLBI) and metric curvature bounds on the celestial sphere. By treating atmospheric delay residuals as a stochastic connection on a principal fiber bundle over J2000.0 equatorial coordinates, we prove that angular resolution beyond the classical diffraction limit requires non-local prior calibration across at least four non-coplanar baselines."
doi: "https://doi.org/10.3847/1538-4357/ad2f91"
pdfUrl: "/cv"
citationBibtex: |
  @article{cordry2025epistemic,
    author  = {Cordry, Duncan R. and Lindqvist, E. V. and Narayanan, S.},
    title   = {Epistemic Horizons in Interferometric Astrometry},
    journal = {The Astrophysical Journal},
    year    = {2025},
    volume  = {964},
    number  = {2},
    pages   = {112--148},
    doi     = {10.3847/1538-4357/ad2f91}
  }
sections:
  - id: "sec-intro"
    heading: "§1 · Observational Frames & Phase Closure"
    body: "Every astrometric catalog rests upon an implicit geometric covenant: that angular separations measured across terrestrial or orbital baselines remain invariant under transport along the observer's worldline [1]. When interferometric arrays operate in the sub-milliarcsecond regime, however, tropospheric turbulence and relativistic aberration couple directly to the visibility phase. Rather than treating these perturbations as ad-hoc scalar noise, we formulate the measurement surface as a Riemannian manifold whose local metric tensor is induced by the Fisher information matrix of the incoming wavefront."
  - id: "sec-formalism"
    heading: "§2 · Metric Tensors on the Celestial Sphere"
    body: "Let the unit sphere S² be parameterized by right ascension α and declination δ in the International Celestial Reference System (ICRS). For a baseline vector B_ij connecting stations i and j, the geometric delay τ_g = (B_ij · s) / c defines a family of concentric cones intersecting the celestial vault [2]. When three stations form a closed triangle, the bi-spectrum phase closure Φ_ijk cancels station-based clock drifts but introduces a topological degeneracy whenever the source structure contains asymmetric emission knots at the scale of the synthesized beam."
  - id: "sec-bounds"
    heading: "§3 · Epistemic Resolution Bounds & Verification"
    body: "Applying our curvature bound to archival 230 GHz observations demonstrates that apparent super-resolution reconstructions below 0.35λ/D systematically alias unmodeled baseline torsion into spurious ring asymmetries. We derive an exact analytical regularizer—the Invariant Astrolabe Prior—that prunes non-physical spatial frequencies while preserving sharp horizon silhouettes."
references:
  - num: 1
    citation: "Poincaré, H. (1902). La Science et l'Hypothèse. Paris: Ernest Flammarion, Ch. IV (L'Espace et la Géométrie)."
    doiUrl: "https://doi.org/10.1017/CBO9781139568050"
    note: "Foundational argument that spatial geometry is inseparable from the physical rigid-body conventions used to measure it."
  - num: 2
    citation: "Cordry, D. R. (2024). The Geometry of Epistemic Space: Sub-structures of Measurement. Cambridge: MIT Press."
    doiUrl: "https://mitpress.mit.edu"
    note: "Derives the full fiber-bundle formulation of equatorial reference frames in Chapters 2 and 4."
---
