# Photobooth Platform PRD

## Problem Statement

Photobooth operators need a single system that can manage photo strip and flipbook sessions from capture to delivery without relying on manual file handling, disconnected applications, or user accounts.

Guests need a simple experience where they can select what they want to create, capture their content, review or retake it where allowed, and access their finished output without creating an account or authenticating.

The system must operate reliably in a local event environment where internet connectivity may be unavailable or unstable while still supporting optional online delivery of finalized photos and videos.

The system therefore needs three connected components:

1. A local Photobooth Software responsible for the primary guest experience, camera workflow, template processing, session management, generation, and printing.
2. A local Captive Website accessible by guest devices connected to the photobooth network.
3. A publicly deployed Website where finalized outputs can be accessed through session-specific links or QR codes.

---

## Solution

The platform will provide a session-based photobooth workflow centered around a FastifyJS backend.

Guests will begin a session through the local Photobooth Software and select between:

* Photo Strips
* Flipbook

Photo Strip sessions will allow users to select a template, capture images, review the result, perform a limited number of retakes, generate the final composition, and print or publish the result.

Flipbook sessions will allow users to select a frame, review instructions, capture three cover photos, record three six-second videos, preview the result, and generate the final flipbook output.

All local systems will operate without user authentication. Access and workflow control will be based on temporary sessions managed by the backend.

The FastifyJS backend will act as the central authority for session state, file generation, PostgreSQL persistence, validation, retake limits, media limits, and output generation.

The Captive Website will connect to the same local backend and allow guests on the event network to access session-specific content.

Finalized outputs intended for online access will be uploaded to Cloudinary and exposed through a separately deployed Next.js website hosted on Vercel.

---

## User Stories

### General Session Flow

1. As a guest, I want to start a new photobooth session, so that my activity is separated from previous guests.

2. As a guest, I want to use the photobooth without creating an account, so that I can immediately begin using the booth.

3. As a guest, I want the system to ask what I am creating today, so that I can choose the correct photobooth experience.

4. As a guest, I want to choose between Photo Strips and Flipbook, so that I can create my preferred output.

5. As a guest, I want my session to maintain its progress, so that navigating between steps does not lose my work.

6. As a guest, I want the application to prevent invalid workflow actions, so that I cannot accidentally break my session.

7. As a guest, I want clear progress through the current workflow, so that I know what step comes next.

8. As a guest, I want the interface to return to the starting page after my session finishes, so that the booth is ready for the next guest.

9. As an operator, I want to cancel an abandoned active session, so that the booth can begin a new session safely.

10. As an operator, I want sessions to be isolated from each other, so that one guest cannot modify another guest's content.

11. As an operator, I want the backend to control session state, so that client-side manipulation cannot bypass workflow rules.

12. As an operator, I want each session to use a randomly generated identifier, so that sessions cannot easily be guessed or enumerated.

13. As an operator, I want sessions to have temporary access tokens where necessary, so that possession of a session identifier alone does not grant control over the session.

---

### Intro Page

14. As a guest, I want the root page to display the session type selector, so that I can immediately begin.

15. As a guest, I want to see "What are we creating today?", so that the purpose of the selection is clear.

16. As a guest, I want Photo Strips to be presented as a selectable option, so that I can start a Photo Strip session.

17. As a guest, I want Flipbook to be presented as a selectable option, so that I can start a Flipbook session.

18. As a guest, I want selecting an option to create or associate my current session with that workflow, so that subsequent actions follow the correct process.

---

### Photo Strip Workflow

19. As a Photo Strip guest, I want to view available templates, so that I can select the appearance of my photo strip.

20. As a Photo Strip guest, I want to preview a template before selecting it, so that I understand how my photos will appear.

21. As a Photo Strip guest, I want to select one template, so that the system knows how to compose my final output.

22. As a Photo Strip guest, I want selecting a template to proceed to the capture stage, so that the workflow remains simple.

23. As a Photo Strip guest, I want to see the camera feed before capturing, so that I can position myself correctly.

24. As a Photo Strip guest, I want a countdown before each photo, so that I have time to prepare.

25. As a Photo Strip guest, I want the system to capture the required number of images for the selected template, so that every template slot is filled.

26. As a Photo Strip guest, I want the system to indicate how many images have already been captured, so that I know my progress.

27. As a Photo Strip guest, I want to see my captured images after the sequence completes, so that I can review them.

28. As a Photo Strip guest, I want to see my captured images positioned inside the selected template, so that I can preview the actual final result.

29. As a Photo Strip guest, I want to select individual images for retake, so that I do not need to repeat the entire session.

30. As a Photo Strip guest, I want retaken photos to replace the previous version, so that only my preferred image appears in the final output.

31. As a Photo Strip guest, I want to see how many retakes I have remaining, so that I can decide when to use them.

32. As a Photo Strip guest, I want the system to allow no more than four retakes per session, so that the booth workflow remains controlled.

33. As an operator, I want the four-retake limit enforced by the backend, so that guests cannot bypass it using client-side manipulation.

34. As a Photo Strip guest, I want to finalize my result when I am satisfied, so that the system can generate the final image.

35. As a Photo Strip guest, I want the final composition to preserve the selected template, image positioning, and visual design, so that the output matches the preview.

36. As a Photo Strip guest, I want the final output to be saved as part of my session, so that it can be printed or published.

37. As a Photo Strip guest, I want to print my final strip when printing is available, so that I receive a physical copy.

38. As a Photo Strip guest, I want access to a QR code when online delivery is enabled, so that I can retrieve my output on my phone.

39. As an operator, I want printing to occur only after a session is finalized, so that unfinished compositions are not printed accidentally.

40. As an operator, I want the system to prevent further capture changes after finalization unless explicitly reopened, so that completed outputs remain consistent.

---

### Flipbook Workflow

41. As a Flipbook guest, I want to view available frames, so that I can choose the appearance of my flipbook.

42. As a Flipbook guest, I want to preview the selected frame, so that I understand what the final output will look like.

43. As a Flipbook guest, I want selecting a frame to continue to the instructions page, so that I understand what to do before recording.

44. As a Flipbook guest, I want to see a clear list of instructions, so that I know how the recording process works.

45. As a Flipbook guest, I want to explicitly continue after reading the instructions, so that recording does not begin unexpectedly.

46. As a Flipbook guest, I want the cover photo process to happen before video recording, so that the workflow remains predictable.

47. As a Flipbook guest, I want to capture three cover photos, so that the system has the required cover assets.

48. As a Flipbook guest, I want a countdown before each cover photo, so that I can prepare.

49. As a Flipbook guest, I want to see how many cover photos remain, so that I understand my progress.

50. As a Flipbook guest, I want the system to continue to video capture after all three cover photos are complete, so that I do not need to navigate manually.

51. As a Flipbook guest, I want to record three separate videos, so that the system has the required flipbook motion content.

52. As a Flipbook guest, I want each recording to last six seconds, so that the generated output follows a consistent format.

53. As a Flipbook guest, I want the system to automatically stop recording after six seconds, so that I do not need to stop it manually.

54. As an operator, I want the backend to validate the number of uploaded videos, so that sessions cannot exceed the expected three recordings.

55. As an operator, I want the backend to validate media duration, so that excessively long videos are rejected.

56. As a Flipbook guest, I want to see which recording I am currently taking, so that I know whether it is video one, two, or three.

57. As a Flipbook guest, I want to preview my captured assets before finalization, so that I understand the final result.

58. As a Flipbook guest, I want the system to generate the final flipbook output after confirmation, so that I receive the finished product.

59. As a Flipbook guest, I want the generated output associated with my session, so that it can be retrieved later.

60. As a Flipbook guest, I want access to my finalized output through QR delivery where available, so that I can access it from my phone.

---

### Template and Frame Management

61. As an operator, I want to create Photo Strip templates, so that guests can choose from multiple designs.

62. As an operator, I want to upload a background image for a template, so that I can customize the visual appearance.

63. As an operator, I want to define where captured images appear on the background, so that different template layouts can be supported.

64. As an operator, I want to create multiple image slots, so that templates can support multiple captured photos.

65. As an operator, I want to position each image slot independently, so that custom layouts are possible.

66. As an operator, I want to define the width and height of each image slot, so that captured images fit the intended design.

67. As an operator, I want to define the stacking order of template elements, so that overlays can appear above or below captured images.

68. As an operator, I want templates to define their intended output dimensions, so that rendering is consistent.

69. As an operator, I want uploaded template files validated before use, so that invalid files do not disrupt the booth.

70. As an operator, I want template names and identifiers to be unique and manageable, so that templates can be referenced reliably.

71. As an operator, I want to preview a template with placeholder images before making it available, so that I can verify the layout.

72. As an operator, I want to disable templates without deleting them, so that temporary designs can be removed from guest selection.

73. As an operator, I want to create and manage Flipbook frames, so that different Flipbook designs can be offered.

74. As an operator, I want template configuration stored separately from generated session content, so that editing templates does not modify previous sessions.

---

### Local Photobooth Software

75. As a guest, I want the Photobooth Software to work without internet access, so that the event can continue during connectivity failures.

76. As an operator, I want the Photobooth Software to use a React and Vite frontend, so that the local interface remains lightweight and responsive.

77. As an operator, I want the local frontend to communicate only through the FastifyJS backend for persisted operations, so that business rules remain centralized.

78. As an operator, I want captured media stored locally before any cloud upload occurs, so that the local workflow does not depend on external services.

79. As an operator, I want generated outputs organized by session, so that media belonging to different guests remains isolated.

80. As an operator, I want generated filenames controlled by the backend, so that client input cannot manipulate filesystem paths.

81. As an operator, I want a navigation warning before a frontend reload, so that I can avoid unintentionally resetting the active booth workflow.

82. As an operator, I want the application to show an understandable error when the camera becomes unavailable, so that the issue can be resolved without restarting the entire system.

83. As an operator, I want the application to prevent capture when the camera is unavailable, so that corrupted or empty session assets are not created.

84. As an operator, I want media processing failures to keep the original captures where possible, so that the session can be recovered.

85. As an operator, I want completed session outputs persisted until their configured cleanup time, so that guests have sufficient time to retrieve them.

---

### FastifyJS Backend

86. As a developer, I want FastifyJS to be the central backend for all local applications, so that workflow rules are implemented once.

87. As a developer, I want the backend to create and manage photobooth sessions, so that all clients share the same session state.

88. As a developer, I want session types stored explicitly, so that Photo Strip and Flipbook workflows cannot be mixed accidentally.

89. As a developer, I want session states stored explicitly, so that workflow transitions can be validated.

90. As a developer, I want invalid state transitions rejected, so that clients cannot skip required steps.

91. As a developer, I want the backend to persist session metadata in PostgreSQL, so that session state survives backend restarts and administrator recovery actions.

92. As a developer, I want generated media metadata persisted independently from actual media files, so that the system can locate and manage outputs reliably.

93. As a developer, I want local output files stored in a configured output directory, so that printing, publishing, and cleanup can operate consistently.

94. As a developer, I want the backend to distinguish original captures from generated outputs, so that originals can be preserved during processing.

95. As a developer, I want the backend to enforce all capture limits, so that clients cannot override business rules.

96. As a developer, I want the backend to validate media before accepting it, so that malformed inputs are rejected.

97. As a developer, I want the backend to generate filenames instead of accepting arbitrary client filenames, so that path traversal is prevented.

98. As a developer, I want the backend to restrict the size of incoming media, so that excessively large requests cannot consume uncontrolled resources.

99. As a developer, I want the backend to expose only the APIs required by the Photobooth Software and Captive Website, so that the attack surface remains small.

100. As a developer, I want PostgreSQL credentials available only to the backend, so that clients cannot connect directly to the database.

101. As a developer, I want the PostgreSQL application role to use least-privilege permissions, so that backend compromise has limited database impact.

102. As a developer, I want cancelled sessions to reject further workflow actions, so that abandoned work cannot be resumed accidentally.

103. As a developer, I want session access to be validated on protected session operations, so that one client cannot modify another active session.

104. As a developer, I want the backend to support health checks, so that the local software can detect whether the backend is operational.

---

### Captive Website

105. As a guest, I want to access a local website from my phone while connected to the photobooth network, so that I can interact with my session without using the booth computer.

106. As a guest, I want the Captive Website to work without public internet access, so that local delivery remains available during offline events.

107. As a guest, I want the Captive Website to identify my intended session through a session-specific link or QR code, so that I do not have to manually enter an identifier.

108. As a guest, I want to view the finalized output belonging to my session, so that I can save it to my device.

109. As a guest, I want the Captive Website to clearly indicate when an output is still processing, so that I know why it is not yet available.

110. As a guest, I want the Captive Website to clearly indicate when local output cannot be found, so that I understand why the content is unavailable.

111. As an operator, I want the Captive Website to connect to the same FastifyJS backend as the Photobooth Software, so that session data remains consistent.

112. As an operator, I want the Captive Website to expose only guest-safe functionality, so that booth control operations cannot be triggered from guest devices.

113. As an operator, I want guest devices prevented from accessing arbitrary local files, so that only session-approved outputs are exposed.

114. As an operator, I want Captive Website requests rate-limited where appropriate, so that a guest device cannot overwhelm the local backend.

115. As an operator, I want access to session media restricted to the correct session, so that one guest cannot browse another guest's output.

---

### Deployed Website

116. As a guest, I want to scan a QR code and access my finalized content from the internet, so that I can retrieve it after leaving the event.

117. As a guest, I want the deployed website to work independently from the local photobooth network, so that the booth computer does not need to remain publicly accessible.

118. As a guest, I want a session-specific URL, so that my output is directly accessible without searching.

119. As a guest, I want the online page to display only finalized outputs, so that incomplete captures are never published.

120. As a guest, I want the deployed website to work well on mobile devices, so that I can access my output from my phone.

121. As a guest, I want expired or deleted media to produce an appropriate unavailable message, so that broken resources are handled clearly.

122. As an operator, I want finalized outputs uploaded to Cloudinary, so that media delivery does not depend on the local machine.

123. As an operator, I want the deployed website hosted on Vercel, so that public delivery is independent of event infrastructure.

124. As a developer, I want Cloudinary API secrets kept server-side, so that they are never exposed to browsers.

125. As a developer, I want public session identifiers to be non-sequential and difficult to guess, so that online session enumeration is impractical.

126. As an operator, I want online content to support expiration or deletion, so that guest media does not remain publicly accessible indefinitely.

127. As an operator, I want the cloud copy to contain only finalized media intended for delivery, so that raw captures remain local unless explicitly required.

128. As a developer, I want the deployed website to avoid direct communication with the local FastifyJS backend, so that the local system is never exposed to the public internet.

---

### Security and Privacy

129. As a guest, I want my session separated from other guests, so that my media cannot be modified by another session.

130. As a guest, I want temporary session access rather than a permanent account, so that I do not need to provide personal information.

131. As an operator, I want all workflow restrictions enforced by the backend, so that modifying frontend requests cannot bypass booth rules.

132. As an operator, I want session identifiers generated using cryptographically secure randomness, so that they cannot be predicted.

133. As an operator, I want uploaded files validated using actual file characteristics, so that renamed malicious or malformed files are rejected.

134. As an operator, I want file sizes restricted, so that storage or memory cannot easily be exhausted by oversized uploads.

135. As an operator, I want backend-controlled storage paths, so that clients cannot perform path traversal.

136. As an operator, I want database access restricted to the backend, so that guest devices cannot query PostgreSQL directly.

137. As an operator, I want cloud credentials isolated from client applications, so that guests cannot obtain Cloudinary management credentials.

138. As an operator, I want public session URLs to expose no sequential database identifiers, so that one guest cannot enumerate other sessions.

139. As an operator, I want published cloud outputs deleted after two months, so that guest media is not publicly stored indefinitely.

140. As an operator, I want the local backend blocked from direct public internet access, so that it cannot become an external attack target.

---

## Implementation Decisions

### Authoritative Implementation Contract

This section resolves implementation details established after the original user stories. If it conflicts with another section of this PRD, this section takes precedence.

#### Delivery Scope And Runtime

* This release includes both Photo Strip and Flipbook workflows; there is no reduced MVP.
* The repository is a monorepo containing the Fastify backend, local React/Vite Photobooth Software, local standalone Next.js Captive Website, and public Next.js website.
* Development ports are Fastify `3000`, Photobooth Software `5173`, and Captive Website `5174`.
* Development uses the applications' development servers. In production, the Captive Website is built and served locally on port `80` at the photobooth gateway, for example `http://192.168.4.1`.
* Local and public QR retrieval follows `docs/system-architecture.md`: every printed card contains the full public URL, the Captive Website extracts its public ID for local retrieval, and the public website resolves that same ID online. There is no split DNS.
* The supported runtime is Linux. Camera setup, OBS, scrcpy, and iphone-streamer are external operating infrastructure; the application only requires an administrator-selected browser camera device.
* The application does not detect black frames. If OBS has no usable source, it displays the feed it receives and the administrator handles recovery.
* PostgreSQL is always local. A photobooth administrator initializes it with a CLI command before use.
* The administrator and assisted guest use the same Photobooth Software over physical/VNC access. There is no separate application authentication boundary for local administrator routes.

#### Assisted Booth Workflow

* “Guest action” means an action the assisted guest may perform on the shared booth display; the administrator may perform every such action and controls recovery, printing, and publishing oversight.
* A session begins when the administrator selects Photo Strip or Flipbook, then selects an existing event or creates one before capture begins.
* Interactive sessions do not expire automatically. The administrator can explicitly cancel an abandoned session and start a new one.
* A new session may begin once the prior session has been marked printed. Publishing may remain queued or in progress and must not block the booth.
* Browser navigation should warn that progress may be lost. The system does not promise recovery after a page reload; the administrator manages the current session.
* Every generated local output receives a seven-character, cryptographically random base-62 public ID (`A-Z`, `a-z`, `0-9`) before publication. The printed QR contains the full URL `https://myphotobooth.com/:id`.
* Booth confirmation locks the selected captures and generates a local output. It is deliberately separate from cloud finalization so printing and local QR retrieval continue while offline.
* Cloud finalization occurs only after the asset has uploaded to Cloudinary and Supabase has recorded its public delivery metadata.

#### Photo Strip Contract

* Every generated Photo Strip is a PNG rendered at 300 DPI on a fixed 4R canvas: `1800 x 1200 px` for landscape and `1200 x 1800 px` for portrait.
* Templates support both 6x4-inch landscape and 4x6-inch portrait layouts.
* Captures are stored as unmodified 16:9 originals. The final compositor applies centered `cover` cropping to each placement.
* A template’s required capture count is the number of unique capture indices it defines, not its total number of placements.
* The capture sequence automatically captures each required index and assigns them in index order. The administrator can set the countdown to 3, 5, or 10 seconds per template; retakes use that same countdown.
* A retake replaces exactly one selected capture and may be repeated while the session is still in review, subject to the four-retake session limit.
* Booth confirmation is irreversible. It generates the PNG, public ID, QR, and a queued publication record. Printing and publication are always attempted after booth confirmation.
* Firefox handles browser printing through CUPS for the Epson L3250. The application does not retry printing. The administrator records `is_printed` and `copies_printed` manually.

#### Template Editor Contract

* A template is a fixed-size 4R canvas with a single transformable PNG, JPG, or SVG background asset and one or more optional transformable overlay image assets.
* The editor offers grid presets such as `2x1`, `2x2`, `3x1`, and `3x2` only as placement starting points. The saved model uses freeform placements.
* Each placement has `captureIndex`, `x`, `y`, `width`, `height`, `rotation`, `borderRadius`, and `zIndex`.
* Each overlay has a `label`, `x`, `y`, `width`, `height`, `rotation`, and `zIndex`.
* Multiple placements may reference the same `captureIndex`, allowing one capture to appear in multiple printed positions. Each placement remains independently movable and resizable.
* The editor shows numbered rectangles rather than live image previews. Overlays render as labeled dashed shapes above the placements by `zIndex`.
 * The editor provides manual inputs for every placement field, every overlay field, and for the background image transform: `x`, `y`, `width`, and `height`.
* Photo placements have independently editable `width` and `height`; the backend accepts any positive dimensions. Overlay images are always rendered as 1:1 squares — the editor keeps `width` equal to `height`, and the backend accepts and enforces a single dimension.
 * Administrators can create, edit, delete, activate, and deactivate templates. A session stores a snapshot of the selected template at selection time, so later edits never change that session’s result.

#### Flipbook Contract

* A Flipbook session uses one selected frame, three cover-photo choices, and three six-second MKV or MP4 recording choices.
* Each cover capture and recording begins after a fixed 10-second countdown. There are no Flipbook retakes.
* In review, the guest selects one cover photo and one video. A visible five-minute countdown defaults both selections to the first cover and first video if no choice is made.
* The administrator inputs the number of frames to extract for each Flipbook session, initially 21. The selected video is converted into that many frames. The final output is one looping GIF: the selected cover holds for three seconds, then the video frames play for an implementation-configurable 0.5 to 1 second each.
* If GIF processing exceeds two minutes, the system discards the Flipbook assets, explains the failure, and restarts the workflow at cover capture.

#### Publishing And Retrieval Contract

* Booth confirmation creates a local publication record with a `queued` status. A local worker polls `PUBLIC_APP_URL` every five seconds and only attempts upload while it resolves.
* Uploads use bounded concurrency. Failures retry at most five times with exponential backoff and jitter; then the job moves to a local PostgreSQL dead-letter queue.
* An administrator dashboard displays `queued`, `in_progress`, `uploaded`, and `failed` publication states and can manually retry dead-letter jobs.
* Cloudinary stores only cloud-finalized delivery assets. Supabase stores the public ID, Cloudinary asset reference/link, event metadata, publication state, cloud-finalized timestamp, and expiry metadata.
* A final output is considered published only once Cloudinary upload succeeds and Supabase has a corresponding published record. The two-month retention period starts at that successful cloud finalization/upload time.
* The Captive Website parses the public ID from a scanned full QR URL or manual URL/code input, then displays and downloads the local generated asset. Possession of the random ID is the local access control.
* The public Vercel website resolves `/:id` through Supabase to the Cloudinary asset. Before publication, or after deletion, it returns a `404` unavailable page. It never contacts the local booth.
* Supabase cron deletes the Cloudinary asset and public metadata two months after cloud finalization. Local media is not deleted by this cloud-retention job.
* Captive and public ID lookups must be rate-limited to make public-ID enumeration impractical.

#### Events And Errors

* Event setup is a local administrator route. It records event name, event date, event ID, and operator name. Event name plus event date must be unique; the same name may be reused on a different date.
* Every output and publication record stores its event, date/time, and associated public ID.
* Errors must tell the user what happened and the available recovery action.
* Camera failure: “Camera capture failed. Check the camera feed and retake this photo.” The current capture can be retried.
* Composition failure: “Could not generate the photo strip. Your original photos are safe.” The administrator can retry generation.
* GIF timeout: “GIF processing took too long. Please recapture this flipbook.” The system discards Flipbook assets and restarts cover capture.
* Print failure: “Printing was not confirmed. Complete printing in Firefox/CUPS, then record the printed copy count.” The administrator enters `is_printed` and `copies_printed` after resolving CUPS.
* Publishing failure: “Saved locally. Online delivery will retry automatically.” The job remains queued or can be retried from the dashboard.
* Local retrieval failure: “Photo not found. Check the QR code or enter the full link/code again.”
* Public retrieval failure returns a `404` page: “This photo has not been published or is no longer available.”
* Invalid workflow action: “This step is not available yet. Continue the current workflow.”
* Unknown failure: “Something went wrong. Your saved captures have not been deleted.” The administrator can retry or start recovery.

### System Architecture

The platform will consist of three primary applications and one shared local backend.

#### Photobooth Software

* Built using React and Vite.
* Runs on the primary photobooth computer.
* Provides the complete Photo Strip and Flipbook capture workflow.
* Communicates with the local FastifyJS backend.
* Does not directly access PostgreSQL.
* Does not directly write arbitrary files to the output directory.
* Does not require user authentication.
* Uses temporary backend-managed sessions.

#### Captive Website

* Built using Next.js.
* Runs within the local photobooth environment.
* Connects to the same FastifyJS backend used by the Photobooth Software.
* Primarily provides guest-safe session viewing and delivery functionality.
* Does not expose booth administration or arbitrary capture operations.
* Does not require user accounts.
* Uses possession of a random public output ID for retrieval only; it does not create guest sessions.

#### Deployed Website

* Built using Next.js.
* Deployed through Vercel.
* Uses Cloudinary for finalized media delivery.
* Does not directly connect to the local PostgreSQL instance.
* Does not directly connect to the local FastifyJS backend.
* Uses non-sequential public output identifiers.

#### FastifyJS Backend

* Acts as the source of truth for the local system.
* Connects to PostgreSQL.
* Manages local filesystem outputs.
* Manages sessions.
* Enforces workflow transitions.
* Enforces retake limits.
* Enforces media counts and constraints.
* Handles template processing.
* Handles final output generation.
* Provides generated local assets to the Captive Website.
* Coordinates cloud finalization of generated delivery assets.

---

### Session Model

Each photobooth interaction will create a temporary session.

A session will include, at minimum:

* Internal identifier
* Public/random identifier where applicable
* Session type
* Current workflow state
* Selected template or frame
* Retake count
* Capture progress
* Creation timestamp
* Last activity timestamp
* Cancellation timestamp where applicable
* Booth confirmation status
* Publication status

Sessions will not represent user accounts.

No personal authentication is required for normal local usage.

Session access may use a random session token where a client needs to prove control over an active session.

---

### Photo Strip State Model

The Photo Strip workflow will follow controlled state transitions broadly equivalent to:

* Created
* Template Selected
* Capturing
* Review
* Booth Confirmed
* Printed
* Cancelled

Publication is an independent asynchronous status: `queued`, `in_progress`, `uploaded`, or `failed`.

The backend will reject operations that are invalid for the current state.

The maximum number of retakes is four per session.

The backend is the authoritative source for the retake count.

---

### Flipbook State Model

The Flipbook workflow will follow controlled state transitions broadly equivalent to:

* Created
* Frame Selected
* Instructions
* Cover Capture
* Video Capture
* Review
* Processing
* Booth Confirmed
* Cancelled

Publication is an independent asynchronous status: `queued`, `in_progress`, `uploaded`, or `failed`.

The system requires:

* Three cover photos
* Three videos
* Six seconds per video

These constraints will be validated by the backend.

---

### Template Model

Templates will store:

* Identifier
* Name
* Type
* Background asset
* Overlay assets
* Fixed 4R orientation and output dimensions
* Active status
* Required capture count
* Placement definitions
* Creation metadata

Each placement includes:

* Capture index
* X position
* Y position
* Width
* Height
* Rotation
* Border radius
* Layer order

Grid presets are editor conveniences only. Multiple placements may reference one capture index, but every placement moves and resizes independently.

Template definitions will be stored separately from generated session media, including a snapshot recorded when a session selects the template.

Changing a template must not modify previously generated session outputs.

---

### File Storage

Local files will be grouped by session.

The backend will determine storage locations and filenames.

Client-provided filesystem paths will never be accepted.

Media will be logically separated into categories such as:

* Original captures
* Video captures
* Intermediate processing assets
* Final outputs

Generated local assets are queued for cloud finalization; Cloudinary stores only cloud-finalized delivery assets.

Raw local captures will not automatically become public.

---

### PostgreSQL

PostgreSQL will store system metadata rather than acting as primary media storage.

Expected database entities include:

* Sessions
* Session captures
* Session videos
* Templates
* Template slots
* Generated outputs
* Publication records

The FastifyJS backend will use a dedicated least-privilege PostgreSQL role.

Frontend applications will never directly connect to PostgreSQL.

---

### API Decisions

The backend API will be session-oriented.

API categories will include:

* Session creation
* Session retrieval
* Workflow transitions
* Template listing
* Frame listing
* Photo capture registration
* Video capture registration
* Retake requests
* Session review
* Finalization
* Output retrieval
* Publication
* Session cancellation

All state-changing operations will validate:

* Session existence
* Session validity
* Session ownership or token where required
* Current session state
* Business-rule constraints
* Media constraints

---

### Media Validation

Uploaded media will be validated server-side.

Validation will include:

* Allowed media type
* Actual file format
* Maximum file size
* Valid image or video structure
* Required dimensions where applicable
* Required video duration where applicable

The backend will not rely solely on filename extensions or browser-provided MIME types.

---

### Local Network Security

The local FastifyJS backend will not intentionally be exposed to the public internet.

Only required ports will be available to devices on the photobooth network.

Guest-facing routes will be kept separate from privileged booth operations.

The Captive Website will expose only functionality required by guests.

---

### Cloud Delivery

Only generated delivery media queued by booth confirmation will be eligible for Cloudinary upload.

Cloudinary credentials will remain server-side.

The public deployed website will use random public identifiers.

Cloud assets and their Supabase public metadata are deleted two months after successful cloud finalization.

The public system must not reveal internal database identifiers or local filesystem structure.

---

### Session Lifecycle And Retention

Interactive sessions do not expire automatically. An administrator cancels abandoned sessions explicitly.

Cancelled sessions cannot perform additional capture or modification actions.

Generated local media remains available independently of cloud delivery.

Cloudinary assets and their Supabase public metadata are deleted two months after successful cloud finalization/upload.

---

## Testing Decisions

Tests must validate externally observable behavior rather than internal implementation details.

A good test should verify what the system accepts, rejects, produces, persists, or exposes from the perspective of a client or user.

Tests should not depend on private function structure, internal helper names, or implementation-specific organization.

### Photobooth Software Testing

The Photobooth Software will be tested for:

* Starting a new session
* Selecting Photo Strip
* Selecting Flipbook
* Selecting templates and frames
* Navigating through workflow steps
* Camera capture behavior
* Countdown behavior
* Review behavior
* Retake selection
* Retake limit display
* Finalization
* Error states
* Navigation warning and administrator-managed reset after frontend reload

---

### Photo Strip Testing

Tests will verify:

* Required number of images can be captured
* Results appear after capture
* Individual images can be selected for retake
* Retakes replace the correct images
* Four retakes are allowed
* A fifth retake is rejected
* Retake limits remain enforced during the active session
* Final output uses the selected template
* Finalized sessions cannot unexpectedly return to capture state
* Printing is available only after finalization

---

### Flipbook Testing

Tests will verify:

* Frame selection proceeds to instructions
* Instructions precede capture
* Exactly three cover photos are expected
* Video capture begins after cover photos
* Exactly three videos are expected
* Recordings stop at the configured six-second duration
* Invalid media counts are rejected
* Finalization is unavailable until required assets exist
* Generated output is associated with the correct session

---

### Backend Testing

FastifyJS integration tests will validate:

* Session creation
* Session cancellation
* Session retrieval
* State transitions
* Rejection of invalid transitions
* Retake limits
* Photo count limits
* Video count limits
* Video duration validation
* Media validation
* Invalid session handling
* Session isolation
* Output generation requests
* Publication eligibility
* Health endpoint behavior

Backend tests should primarily interact with the HTTP API rather than internal service implementations.

---

### Database Testing

Database-related integration tests will verify observable persistence behavior including:

* Session state surviving subsequent requests
* Capture metadata belonging to the correct session
* Template relationships
* Retake count persistence
* Finalization state persistence
* Publication metadata persistence
* Cancellation behavior

---

### Captive Website Testing

Tests will verify:

* Valid local session links load the correct session
* Invalid session links are rejected
* Missing local outputs show an appropriate state
* Processing sessions display appropriate feedback
* Finalized media can be accessed
* Content from unrelated sessions cannot be accessed
* Booth-control functionality is not exposed through guest routes

---

### Deployed Website Testing

Tests will verify:

* Valid public session identifiers resolve correctly
* Invalid identifiers do not expose information
* Finalized Cloudinary assets render correctly
* Deleted or expired assets are handled gracefully
* Internal database identifiers are not exposed
* Cloudinary secrets are not delivered to the browser
* Mobile access behaves correctly

---

### Security Testing

Security-focused tests will cover externally visible behavior including:

* Attempts to access another session
* Invalid or missing administrator session tokens
* Sequential identifier enumeration attempts
* Unsupported file uploads
* Oversized file uploads
* Malformed image uploads
* Malformed video uploads
* Path traversal attempts
* Invalid workflow transitions
* Excessive retake attempts
* Excessive video uploads
* Requests against cancelled sessions
* Requests to backend endpoints from unsupported origins where applicable

---

### Prior Art

Where similar test patterns already exist in the codebase, new tests should follow existing conventions for:

* HTTP integration tests
* React component interaction tests
* Next.js page tests
* PostgreSQL-backed integration tests
* Media upload tests
* Session lifecycle tests

End-to-end tests should focus on complete guest workflows rather than internal component composition.

---

## Out of Scope

The following are outside the initial scope of this PRD:

* Guest accounts
* User registration
* User login
* OAuth
* Social login
* Permanent guest profiles
* Password recovery
* Customer identity management
* Payment processing
* Online booking
* Event reservation management
* Facial recognition
* Automatic identification of guests
* Social media publishing
* Native Android or iOS applications
* Public access to the local FastifyJS backend
* Direct browser access to PostgreSQL
* Direct browser access to Cloudinary management credentials
* General-purpose cloud file storage
* Unlimited media retention
* Video editing beyond the processing required to generate the Flipbook
* Full remote administration of the local photobooth
* Multi-tenant SaaS management
* Cross-event analytics unless separately specified
* Authentication for normal local photobooth sessions

---

## Further Notes

The system should be designed as a local-first application.

The primary Photobooth Software must continue to function when internet connectivity is unavailable.

The FastifyJS backend is the source of truth for local session state and business rules.

React, Next.js, and other clients should be treated as untrusted clients for validation purposes. Business rules such as retake limits, capture counts, video constraints, and workflow order must therefore be enforced by FastifyJS.

The local system intentionally does not use user authentication. Isolation is achieved through temporary sessions rather than accounts.

The three systems have different responsibilities:

**Photobooth Software**

* Creates content.
* Controls capture.
* Controls review.
* Generates outputs.
* Initiates printing and publishing.

**Captive Website**

* Provides local guest access.
* Retrieves finalized or processing session content.
* Operates through the same local FastifyJS backend.

**Deployed Website**

* Provides post-event internet access.
* Serves finalized Cloudinary-hosted media.
* Operates independently from the local booth infrastructure.

The deployed system should never require the local photobooth machine to accept incoming public internet connections.

Final media delivery should use random, non-sequential session identifiers suitable for QR codes.

Interactive session lifecycle is administrator-controlled; public cloud retention is fixed at two months after successful cloud finalization/upload.

The architecture should prioritize:

* Offline reliability
* Session isolation
* Simple guest interaction
* Fast recovery from interrupted sessions
* Minimal public attack surface
* Backend-enforced workflow rules
* Controlled media retention
