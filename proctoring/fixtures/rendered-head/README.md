# Rendered head and eye movement (recorded test frames)

65 frames (480×600 JPEG) of the project's rigged human interviewer (`frontend/public/models/human-interview-studio.glb`),
rendered in Blender (Cycles) from a webcam-like viewpoint 0.62 m in front of the face:

| Frames | Movement |
|---|---|
| 000–026 | head turns 0 → 40° → 0 → −40° → 0 in 8° steps, holds of 3 frames at each extreme |
| 027–044 | head pitches 0 → down 30° → 0 → up 30° → 0 |
| 045–064 | head still; eyes turn one way (pupils ~11°), back, the other way, back |

`labels.json` holds the ground truth per frame, measured from the posed geometry, not assumed from bone
inputs: head yaw from the heading of the line between the eyes, pitch from the elevation of the eyes above
the head joint, and eye rotation from the pupil vertex of the eye mesh (the eyes are half-weighted to their
bones, so the pupils turn about half the bone angle).

These are **synthetic** frames of a rendered human, not a person or a webcam recording. They exist because a
still photograph cannot rotate a head or move irises, and 2-D image warps do not change the measured head
angle. Used by `proctoring/test_rendered_motion.py`. Regenerate:

```
D:\blander\blender.exe -b --factory-startup --python scripts/blender/render_head_sequence.py -- frontend/public/models/human-interview-studio.glb proctoring/fixtures/rendered-head
```
