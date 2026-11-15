# Data Sources

## OpenJLPT vocabulary (JLPT N5)

- **Project:** OpenJLPT
- **Repository:** https://github.com/evanclan/OpenJLPT
- **Source file:** `data/json/vocab/n5.json`
- **Source version:** 0.3.0
- **License:** CC BY-SA 4.0. The redistributed and adapted vocabulary data remains under the applicable ShareAlike terms. See the source [LICENSE](https://github.com/evanclan/OpenJLPT/blob/main/LICENSE) and [NOTICE](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md).

This project uses the complete N5 vocabulary export. OpenJLPT attributes level assignments and English glosses to Jonathan Waller's JLPT lists (CC BY), uses JMdict/EDRDG (CC BY-SA 4.0) for dictionary IDs, part-of-speech codes and verification, and includes example sentences from Tatoeba (CC BY 2.0 FR). See OpenJLPT's NOTICE for the full upstream attribution and license details.

The source has been normalized into `data/vocabulary.json`: stable OpenJLPT IDs are prefixed with `n5-`; Japanese headwords/readings, romaji, English meanings, POS codes/labels, JMdict IDs, alternate forms/readings and examples are retained. Examples preserve their Japanese, furigana notation, English translation and Tatoeba ID when provided.

OpenJLPT does not supply Vietnamese meanings. `meaning_vi` is intentionally an empty array in every record; no machine-generated or unverified Vietnamese translations have been added. The website should retain and display the source English meanings until reviewed Vietnamese translations can be supplied. Project-specific schema normalization and UI are original to NhaiTiengNhat; the underlying source data is not claimed as original project content.

## Course cover images

The five course covers in `assets/images/course-n5.jpg` through `course-n1.jpg` were downloaded from Unsplash image CDN URLs already used by the project. They are used under the [Unsplash License](https://unsplash.com/license); the matching source URLs are:

- N5: `https://images.unsplash.com/photo-1503676260728-1c00da094a0b`
- N4: `https://images.unsplash.com/photo-1434030216411-0b793f4b4173`
- N3: `https://images.unsplash.com/photo-1455390582262-044cdead277a`
- N2: `https://images.unsplash.com/photo-1516321318423-f06f85e504b3`
- N1: `https://images.unsplash.com/photo-1491841550275-ad7854e35ca6`

MySQL stores the local asset paths in `courses.image_url`; image bytes remain in the project assets directory.
