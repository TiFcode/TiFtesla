# Tesla Cybertruck 2025

- Uploader: [Nieve5677](https://sketchfab.com/niev)
- Source: [Tesla Cybertruck 2025](https://sketchfab.com/3d-models/tesla-cybertruck-2025-0fe4980c8cbc441382bfb7d4cf9f092e)
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Downloaded original FBX from Sketchfab (72,672 triangles, 4 meshes). Inner source is labeled “Tesla Cybertruck mid-poly”; mesh nodes are named `desirefxme_*`.

Tesla Studio changes: axis normalization to metres with +Y up and -Z forward; length scaled to 5.683 m. After that scale the file measures about 2.21 m wide and 2.26 m tall, but both figures include the stray blocks described below. Proportions were left as exported aside from the uniform length scale. At load time the viewer drops three detached 48-triangle blocks that float above the cab in the export, centres the off-axis body and scales its width to the owner-manual 2.03 m (`importFit` in `src/studio/vehicles/imported.ts`). Stainless MeshPhysical material; lossless meshopt compression; static presentation wrapper used by the viewer. Glass, doors, tonneau and the wheels are not separated in the source, so those tours are camera studies. Air suspension does not lift the body, because the tires would rise with it.

Compared with [Sketcher's production Cybertruck](https://sketchfab.com/3d-models/tesla-cybertruck-587a0833e60f465090145b139f6c1bfc) (CC BY 4.0, about 381k triangles, uid `587a0833e60f465090145b139f6c1bfc`): that file is the preferred close-up mesh, but `GET /v3/models/587a0833e60f465090145b139f6c1bfc/download` returns HTTP 401 without `SKETCHFAB_TOKEN`. No public GLB mirror was available, and the encrypted viewer `.binz` was not decoded. The Nieve5677 mesh is the CC BY model actually in this repository, so the viewer uses it instead of the authored study.

The authored Cybertruck GLB remains in `public/models/authored/` as a fallback asset. It is not loaded at runtime.

This is not a Tesla-endorsed model.
