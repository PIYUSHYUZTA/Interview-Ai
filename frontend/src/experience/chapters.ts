/**
 * Camera choreography for the landing (docs/reference-redesign-spec.md, page 01): one shot per chapter, each
 * with the key where it starts and the key where it ends. The rig flies one spline through all of them; a chapter
 * holds its composition for most of its scroll, then travels to the next. The tree stands at the origin, its
 * canopy around y = 4.5. `length` is the chapter's scroll span in viewport heights.
 */
export type Vec3 = readonly [number, number, number];
export type CameraKey = { position: Vec3; target: Vec3 };
export type Shot = { id: string; length: number; keys: readonly [CameraKey, CameraKey]; fov?: readonly [number, number] };

export const SHOTS: readonly Shot[] = [
  // Hero: wide and low over the water; the tree right of centre, the copy bottom left (as the reference).
  { id: 'hero', length: 130, keys: [{ position: [1.2, 2.2, 18], target: [-2.2, 1, 0] }, { position: [1.2, 2.4, 15.6], target: [-2, 1.2, 0] }] },
  // Product introduction: drifting closer on the right.
  { id: 'product', length: 160, keys: [{ position: [3.6, 2.6, 8.8], target: [-.8, 3.4, 0] }, { position: [4.4, 3.2, 6.6], target: [-.6, 3.6, 0] }] },
  // How it works: down to the roots, then up the trunk.
  { id: 'how', length: 220, keys: [{ position: [-6.2, 1.6, 6.8], target: [.6, .9, 0] }, { position: [-5, 2.8, 6.4], target: [.6, 2.6, 0] }] },
  // Question generation: climbing along the branches as the pulse travels outward.
  { id: 'questions', length: 180, fov: [40, 34], keys: [{ position: [2.4, 3.4, 4.2], target: [0, 4.2, 0] }, { position: [-1.8, 4.9, 3.4], target: [.4, 4.6, 0] }] },
  // Live interview: a cinematic zoom into the canopy's light.
  { id: 'live', length: 200, fov: [44, 28], keys: [{ position: [2.6, 4.4, 3.6], target: [-1.6, 4.6, -.6] }, { position: [1.6, 4.6, 1.8], target: [-1.4, 4.8, -1.2] }] },
  // Performance intelligence: above the canopy, which turns into teal and amber evidence.
  { id: 'performance', length: 180, fov: [38, 34], keys: [{ position: [-3.2, 5.4, 6], target: [1.8, 4.4, 0] }, { position: [-3.8, 5.8, 4.8], target: [1.6, 4.5, 0] }] },
  // Personalized improvement: following the path of light down to the water's edge.
  { id: 'improvement', length: 180, keys: [{ position: [4.6, 3.4, 7.4], target: [0, 2.6, 0] }, { position: [2.2, 1.3, 8.6], target: [0, 1.4, 0] }] },
  // Final call to action: the whole tree at night, far back.
  { id: 'cta', length: 140, fov: [38, 34], keys: [{ position: [-1.2, 2.4, 16], target: [.4, 1.2, 0] }, { position: [0, 2.6, 19], target: [0, 1.4, 0] }] },
];
