# Listing Studio Deployment Test Notes — August 19, 2026

The live route `https://crosslinkos.netlify.app/listing-studio` returned HTTP 200 after deployment. Browser screenshot capture failed twice in the sandbox, so the page’s visual presentation could not be assessed through a screenshot in this session. The browser HTML was saved at `/home/ubuntu/browser_html/crosslinkos_netlify_app_listing-studio_1787180487750.html` for later DOM inspection.

The API lifecycle was verified with a temporary canonical item. Canonical item creation returned HTTP 201. Platform draft generation completed without the earlier serverless timeout after switching to immediate platform-specific templates. Manually marking the Depop and Mercari drafts as `published`, then recording a Poshmark sale, returned HTTP 201 and created two pending delisting tasks. A fulfillment task also existed for the sale with the pull–print–pack–ship checklist.

The browser-side background-removal UI has been compiled and deployed, but a live image-processing interaction still needs browser-based upload and execution verification.


A browser-console check confirmed that the deployed React Listing Studio mounted correctly. The page renders the mission-control shell, photo workbench, canonical listing fields, AI-assistance action, platform-draft section, and sale handoff. The photo file input is present as the second form control (`input[type=file]`), and the canonical listing form controls are available in the expected order. Browser screenshots remained unavailable, but DOM text confirms the user-facing workflow content is present.


A synthetic SVG product image was injected into the live photo input through the browser, and the UI displayed one product image plus the `White BG` control. Triggering processing exceeded the browser console’s 30-second operation limit, which is plausible for an initial browser-side model download and inference run but still requires recovery-state verification. This was recorded as a background-removal runtime test limitation; the user interface should continue to display a processing state and allow retry or original-image use if the model cannot complete.


A later browser render succeeded and visually confirmed the Listing Studio mission-control UI. The shell, panel hierarchy, photo workbench, canonical listing area, and action center all rendered as intended. The synthetic SVG upload displayed correctly, but the background-removal control transitioned to `RETRY AVAILABLE`. Browser console output did not surface a model error because the long-running evaluation context was cancelled at the action timeout. The next correction is to reject unsupported SVG uploads for this feature and test with raster product photos, while preserving the existing retry/original fallback behavior.


The unsupported synthetic SVG was removed. A generated raster PNG was then injected into the live Listing Studio photo input, and the page confirmed one product photo plus the `White BG` action. This establishes that the supported raster upload path reaches the processing control.


The supported PNG test also reached `RETRY AVAILABLE` after processing. No active toast message remained by the time the DOM was inspected, so the concrete model-loader error was not yet available. The behavior is safely recoverable—the original photo remains available and the retry control remains visible—but the image-processing runtime needs a focused diagnostic before it can be counted as fully verified.


An asynchronous direct call to the installed background-removal library was started against the raster image. The browser console showed that the call began but had not emitted either a success or error message during the initial inspection interval, consistent with a first-run asset download or stalled asset request. A longer wait and console check is required before deciding whether the current browser-only approach is viable in production.


After an additional 45-second wait, the direct IMG.LY background-removal call still emitted no completion or error result. The external IMG.LY package archive is reachable from the sandbox, but it is approximately 285 MB, reinforcing that the default client-side deployment is too large and unpredictable for a responsive production resale workflow. The implementation will need a smaller self-hosted/routable model configuration or a server-side image-processing provider before background removal can be marked production-ready.
