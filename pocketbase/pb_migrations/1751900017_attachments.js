/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — transactions can finally CARRY the receipt, not just a pointer to one.
//
// Task 4 of the 2026-08-22 brief asks for "viewable attachments", on the premise
// that uploaded receipt scans exist and cannot be opened. They did not exist.
// `transactions.receipt_ref` has been a text field since the first migration,
// commented "pointer only; never the raw image", and no line of application code
// has ever written or read it. The capture flow sent a photo to /api/receipt,
// used the extraction, and dropped the image on the floor. So there was nothing
// to view — the missing half was storage, not a viewer.
//
// `attachments` is a real file field, which is what makes PocketBase's own
// `?thumb=` generation available; the brief is explicit that thumbnails must not
// be produced client-side.
//
// maxSelect 5 — a receipt occasionally runs to a second photo, and the brief
// requires swiping between attachments, which needs more than one to be possible
// at all. Not unbounded: this is a household ledger, not a photo library.
//
// maxSize 2MB per file. The client downscales to 1600px on the long edge at JPEG
// q0.85 before upload (the policy Task 2 states, already implemented as
// prepareImage in SpendCapture), which lands a phone photo around 250KB. 2MB is
// therefore ~8x headroom for an awkward scan rather than a target, and it is what
// stops receipt images dominating storage far faster than transaction data ever
// will.
//
// Thumbs are generated on demand and cached by PocketBase: 100x100 is the list
// row the brief specifies, 400x0 the preview that opens while the full-resolution
// original is still loading, so the viewer never shows a blank frame.
//
// NOTE ON ACCESS: this collection's API rules are null (superuser-only) and stay
// that way, so these files are NOT browser-reachable by URL. They are served
// through /api/attachment, which checks the household permission first. A file
// field on a superuser-only collection is private by construction — do not
// "fix" that by opening a view rule.
//
// Backward-safe: existing rows get an empty attachments array and load unchanged.
// `receipt_ref` is deliberately left in place — it is unused, but dropping a
// column is not something to do in passing, and Task 2 may yet want a pointer
// alongside the image.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const txns = app.findCollectionByNameOrId("transactions");

    if (!hasField(txns, "attachments")) {
      txns.fields.add(
        new Field({
          type: "file",
          name: "attachments",
          maxSelect: 5,
          maxSize: 2097152, // 2 MB per file
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
          thumbs: ["100x100", "400x0"],
          protected: false,
        }),
      );
    }

    app.save(txns);
  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("attachments");
      app.save(txns);
    } catch (_) {
      /* collection already gone */
    }
  },
);
