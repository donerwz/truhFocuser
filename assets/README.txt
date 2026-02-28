Drop your video files here. The extension will automatically use them
instead of the built-in SVG demon.

Expected filenames
──────────────────
  whipping.mp4   Plays (looped) while you are on a distracting site.
  locked.mp4     Plays (looped) after the screen fully locks.
                 If this file is missing, whipping.mp4 keeps playing.

Supported formats
─────────────────
  MP4 (H.264) works best across all Chrome versions.
  WebM is also fine — just rename the constants in content.js:
    VIDEO_WHIP   = chrome.runtime.getURL('assets/whipping.webm')
    VIDEO_LOCKED = chrome.runtime.getURL('assets/locked.webm')

Tips
────
• Keep videos short (1–3 s) and set them to loop in your video editor,
  or rely on the <video loop> attribute the extension already sets.
• Transparent-background WebM files work great if you want to keep
  the drop-shadow effect from the CSS.
• After adding files, reload the extension at chrome://extensions
  and refresh the tab you are testing on.
