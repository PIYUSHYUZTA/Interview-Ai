Test inputs downloaded from the official MediaPipe asset bucket:

- `portrait.jpg`: https://storage.googleapis.com/mediapipe-assets/portrait.jpg
- `right_hands.jpg`: https://storage.googleapis.com/mediapipe-assets/right_hands.jpg
- `blank.jpg`: generated locally as a 320×240 black JPEG.

The tests resize these fixtures in memory. The two-face test places the portrait beside itself; it tests detection count, not identity recognition. These are reference image tests, not a webcam accuracy benchmark.
