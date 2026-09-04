# Photobooth Offline-First Photo Retrieval Architecture

## Overview

The photobooth system supports both **offline local retrieval** and **online retrieval** using the same printed QR code.

The QR printed on the photocard always contains the full public URL:

```text
https://myphotobooth.com/:id
```

The offline system extracts the photo ID from this URL, while the online web application uses the URL normally.

No split DNS is used.

---

## 1. Captive Portal

The photobooth creates its own local Wi-Fi network.

Example:

```text
SSID: PHOTOBOOTH
Gateway: 192.168.4.1
Internet: Not required
```

When a user connects, the system attempts to open a captive portal.

```text
http://192.168.4.1
```

The local portal provides:

* Scan QR
* Manual URL/code input
* Photo preview
* Download photo

Because captive portal camera access may not work consistently on all devices, manual input must remain available.

---

## 2. Photobooth Display QR Codes

The physical photobooth displays two QR codes.

### QR 1 — Connect to Wi-Fi

Example:

```text
WIFI:T:WPA;S:PHOTOBOOTH;P:password;;
```

Purpose:

```text
Scan
↓
Connect to PHOTOBOOTH Wi-Fi
```

### QR 2 — Open Local System

```text
http://192.168.4.1
```

Purpose:

```text
Scan
↓
Open local photobooth portal
```

This acts as a fallback if the captive portal does not automatically appear.

---

## 3. Online Web Application

The public web application is deployed through Vercel.

Photo URLs use:

```text
https://myphotobooth.com/:id
```

Example:

```text
https://myphotobooth.com/7fK92pQx
```

When accessed normally through the internet:

```text
User
↓
myphotobooth.com/:id
↓
Vercel
↓
Cloud photo storage
↓
Preview / Download
```

---

## 4. Printed Photocard QR

The QR printed on every photocard contains the complete permanent URL.

Example:

```text
https://myphotobooth.com/7fK92pQx
```

The QR does **not** contain only:

```text
7fK92pQx
```

This allows the same QR to remain usable later when the user has internet access.

---

## 5. Offline Local Retrieval

While connected to the photobooth Wi-Fi, the user opens:

```text
http://192.168.4.1
```

They then scan the QR printed on their photocard.

The scanned value is:

```text
https://myphotobooth.com/7fK92pQx
```

The local system does not navigate to this URL.

Instead, it parses the URL:

```text
https://myphotobooth.com/7fK92pQx
                         ↓
                     7fK92pQx
```

The extracted ID is used to retrieve the photo locally:

```text
7fK92pQx
↓
Local photo database/storage
↓
Photo preview
↓
Download
```

Example local endpoint:

```text
http://192.168.4.1/photos/7fK92pQx
```

---

## 6. Online Retrieval

When the user wants to access the photo later:

```text
Scan printed QR
↓
https://myphotobooth.com/7fK92pQx
↓
Vercel
↓
Lookup photo ID
↓
Cloud storage
↓
Preview / Download
```

No special QR scanner or photobooth network is required.

---

## 7. Photo Synchronization

Photos are initially stored locally.

```text
Photo captured
↓
Generate unique ID
↓
Save locally
↓
Immediately available offline
```

When internet becomes available:

```text
Local photo
↓
Upload queue
↓
Cloud storage
↓
Associate with same photo ID
```

The same ID must exist locally and online.

Example:

```text
ID: 7fK92pQx

Local:
192.168.4.1/photos/7fK92pQx

Online:
myphotobooth.com/7fK92pQx
```

Local photos should not be deleted until the cloud upload has been successfully confirmed.

---

## 8. Architecture Flow

```text
                    PHOTOBOOTH

          ┌─────────────────────────┐
          │ QR 1: Join Wi-Fi        │
          │ QR 2: 192.168.4.1       │
          └────────────┬────────────┘
                       ↓
                Local Portal
                       ↓
             Scan Photocard QR
                       ↓
      https://myphotobooth.com/:id
                       ↓
                  Extract ID
                       ↓
                   Local Photo
                       ↓
              Preview / Download


                  LATER ONLINE

              Scan Photocard QR
                       ↓
      https://myphotobooth.com/:id
                       ↓
                     Vercel
                       ↓
                 Cloud Storage
                       ↓
              Preview / Download
```

---

## 9. Important Design Decisions

* No image data is stored inside the QR.
* No Base64 image encoding is required.
* No split DNS is used.
* The photocard QR always contains the full public URL.
* The local system only extracts the ID from the public URL.
* The local system works without internet.
* Vercel remains the only public deployment.
* A small local web server runs on the photobooth machine.
* Captive portal auto-opening is treated as a convenience, not a requirement.
* `192.168.4.1` QR serves as the captive portal fallback.
* Manual photo code/URL input should remain available.
* Photo IDs should be random and difficult to guess.
* Local photos should remain stored until cloud synchronization succeeds.

## 10. Required Devices and Linux Infrastructure

The main photobooth computer runs **Arch Linux**.

---

### 1. Camera Phone

A smartphone acts as the primary photobooth camera.

Two camera infrastructures are supported depending on the phone operating system.

#### Android — scrcpy

Android devices use **scrcpy**.

```text
Android Phone
    ↓
scrcpy
    ↓
Main Computer
    ↓
Photobooth Application
```

scrcpy provides the V4L2 virtual-webcam output used by the Linux photobooth setup:

```text
Arch Linux
Android
↓
scrcpy
↓
V4L2 Camera Device
↓
Photobooth
```

---

#### iPhone — iphone-streamer

iPhones use:

`fipso/iphone-streamer`

The system streams the iPhone camera through WebRTC:

```text
iPhone Safari
    ↓
WebRTC
    ↓
Local Network
    ↓
Main Computer
    ↓
Photobooth Application
```

The project supports:

* WebRTC camera streaming
* Up to 4K / 30 FPS
* H.264
* Remote zoom
* Lens switching
* Local-network operation

Target architecture:

```text
                    Camera Source

              ┌──────────┴──────────┐
              │                     │
           Android                iPhone
              │                     │
           scrcpy             iphone-streamer
              │                     │
              └──────────┬──────────┘
                         ↓
                  Camera Adapter
                         ↓
                Photobooth Software
```

The main application should not care whether the source is Android or iPhone.

---

## 11. Customer Tablet

The tablet acts as the customer-facing photobooth display.

Customers can:

* Select templates
* Start the session
* View countdowns
* Preview photos
* Request retakes
* Confirm photos
* Trigger printing

The tablet connects to the computer through VNC.

Use **WayVNC**.

```text
Tablet
↓
VNC Client
↓
WayVNC
↓
Dedicated Photobooth Display
```

WayVNC is designed for wlroots-based Wayland compositors and explicitly provides Arch Linux build instructions.

---

## 12. Linux Device Boundaries

The photobooth software uses Linux-supported camera and display infrastructure while keeping their integration behind browser-device selection and VNC.

```text
                 Photobooth Application
                         │
              ┌──────────┼──────────┐
              │          │          │
           Camera      Display     Printer
           Adapter      Adapter     Adapter
               │          │
         ┌─────┴─────┐    │
         │           │  WayVNC
       scrcpy     iPhone
                  Streamer
```

| Component | Linux support |
| --- | --- |
| Photobooth application | Yes |
| Android / scrcpy | Yes |
| Android virtual webcam | V4L2 |
| iPhone / iphone-streamer | Yes |
| Tablet VNC | WayVNC |
| Local server | Yes |
| Captive portal | Yes |
| Photo storage | Yes |
| Cloud synchronization | Yes |
| Vercel web application | OS independent |

---

## 13. Final Device Architecture

```text
                         PHOTOBOOTH

                         Customer
                            │
                    Customer Tablet
                            │
                         VNC
                            │
                       Arch Linux
                         WayVNC
                             │
                     Main Computer
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        Camera         Local Server         Printer
          │                 │
    ┌─────┴─────┐      Photo Storage
    │           │      Captive Portal
 Android      iPhone    QR Generation
    │           │      Cloud Sync
 scrcpy     WebRTC
    │           │
    └─────┬─────┘
          │
    Camera Adapter
```

### Core Requirement

> The photobooth runs on Arch Linux, using Linux-compatible camera streaming, V4L2 camera devices, and WayVNC for the customer display.

---

## Core Principle

> The printed QR is the permanent online photo link. The photobooth's local system reuses that same QR by extracting its photo ID for offline retrieval.
