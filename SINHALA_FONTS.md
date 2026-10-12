# Sinhala font handling for GuruPaper

The site UI is Unicode Sinhala plus English. Keep Sinhala content as Unicode; do not convert words to legacy keyboard/font encodings.

## Website fonts
- Primary UI: **Noto Sans Sinhala** (Google Fonts), with system font fallbacks.
- Optional Sinhala display/title style: **Abhaya Libre** (Google Fonts).
- Official sources: https://github.com/notofonts/sinhala (SIL Open Font License 1.1) and https://github.com/mooniak/abhaya-libre-font (SIL Open Font License).
- The site loads these web fonts through Google Fonts. If the service/network is unavailable, system fallback fonts remain available.

## Uploaded archive review (12 Oct 2026)
The uploaded ZIP contained 648 entries including 645 font files. No license/readme/copyright file was found in the archive. Sampled files "FMAbhaya x.ttf" and "FMMalithi x.ttf" had no code points mapped in the Unicode Sinhala block, while some files labelled Unicode did map Sinhala code points. Since redistribution licenses are unclear and some files appear to use legacy encoding, the archive has not been committed or bundled into the site. Do not embed those files in the website until the specific font's license and Unicode behavior are verified.
