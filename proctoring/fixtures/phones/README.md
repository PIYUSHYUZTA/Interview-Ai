# Phone-detection fixtures

Real photographs used to measure the object detector (`efficientdet_lite0.tflite`, COCO
`cell phone` class). Each file is a resized copy (longest side 640 px, JPEG) of the source
image; nothing else was changed. They are not webcam captures and are not a benchmark.

| File | Source | Author | Licence |
|---|---|---|---|
| `iphone-cc0.jpg` | [Woman using an iPhone](https://commons.wikimedia.org/wiki/File:Woman_using_an_iPhone.jpg) | Kristin Hardwick | CC0 |
| `call-parking-lot.jpg` | [Man talking on cell phone in parking lot](https://commons.wikimedia.org/wiki/File:2009-05-03_Man_talking_on_cell_phone_in_parking_lot.jpg) | Ildar Sagdejev (Specious) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); this resized copy is under the same licence |
| `desk-laptop.jpg` | [Middle-aged woman using a smartphone with laptop](https://commons.wikimedia.org/wiki/File:Middle-aged_woman_using_a_smartphone_with_laptop.jpg) | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `home-closeup.jpg` | [Middle-aged woman using a smartphone at home closeup](https://commons.wikimedia.org/wiki/File:Middle-aged_woman_using_a_smartphone_at_home_closeup.jpg) | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `coffee-closeup.jpg` | [Close-up of a woman using her smartphone while having coffee](https://commons.wikimedia.org/wiki/File:Close-up_of_a_woman_using_her_smartphone_while_having_coffee.jpg) | Nenad Stojkovic | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `no-phone-glasses.jpg` | `business-person.png`, official MediaPipe asset bucket (`storage.googleapis.com/mediapipe-assets`) | MediaPipe test data | as distributed with MediaPipe test assets |
| `no-phone-gestures.jpg` | `man-woman-okay.jpg`, official MediaPipe asset bucket | MediaPipe test data | as distributed with MediaPipe test assets |

The first five contain a phone. The last two contain none but drew low-score `cell phone`
boxes (0.19–0.21) from the detector — a hand holding glasses and hand gestures — and are kept as
false-positive checks. Run `.venv-proctoring\Scripts\python.exe scripts\measure-phone-detection.py`
for the current results.
