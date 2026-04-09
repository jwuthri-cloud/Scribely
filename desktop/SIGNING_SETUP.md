# macOS Signing & Notarization Setup Guide

To build and distribute a signed macOS application, you need to configure several environment variables in `desktop/.env`.

## Required Variables

```bash
APPLE_ID=your_email@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=./certs.p12
CSC_KEY_PASSWORD=your_p12_password
```

`APPLE_APP_SPECIFIC_PASSWORD` is the name **electron-builder** reads (`app-builder-lib`); do not use `APPLE_ID_PASSWORD` — it is ignored and notarization will fail or use wrong credentials.

## Step-by-Step Instructions

### 1. Apple ID & Team ID
- **`APPLE_ID`**: The email address associated with your Apple Developer account.
- **`APPLE_TEAM_ID`**: 
  1. Log in to [developer.apple.com/account](https://developer.apple.com/account).
  2. Scroll down to **Membership Details**.
  3. Copy the **Team ID** (a 10-character alphanumeric string).

### 2. App-Specific Password (`APPLE_APP_SPECIFIC_PASSWORD`)
Required for the notary tool to authenticate without 2FA.
1. Go to [appleid.apple.com](https://appleid.apple.com).
2. Sign in and go to **Sign-In and Security** > **App-Specific Passwords**.
3. Click the **+** (Add) button.
4. Name it something like "Electron Builder".
5. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`) into your `.env`.

### 3. Code Signing Certificate (`CSC_LINK` & `CSC_KEY_PASSWORD`)
You need a **Developer ID Application** certificate to sign apps for distribution outside the Mac App Store.

#### Generate the Certificate
1. Open **Keychain Access** on your Mac.
2. Menu: **Certificate Assistant** > **Request a Certificate from a Certificate Authority**.
3. Enter your email and name, select **Saved to disk**, and continue. This creates a `.certSigningRequest` (CSR) file.
4. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list).
5. Click **+** next to Certificates.
6. Select **Developer ID Application** (under Software).
7. Upload your CSR file and download the generated `.cer` file.
8. Double-click the downloaded `.cer` file to install it into Keychain Access.

#### Export to .p12
1. In **Keychain Access**, select the **login** keychain and **My Certificates** tab.
2. Find the certificate named **Developer ID Application: Your Name (Team ID)**.
3. Right-click the certificate (ensure the private key is nested under it) and select **Export "Developer ID Application..."**.
4. Format: **Personal Information Exchange (.p12)**.
5. Save it as `certs.p12` inside your `desktop/` folder (it is git-ignored).
6. **Important**: Set a strong password for the file. This password is your `CSC_KEY_PASSWORD`.

### 4. Final Configuration
In `desktop/.env`:
- Set `CSC_LINK` to the path of your p12 file (e.g., `./certs.p12` or absolute path).
- Set `CSC_KEY_PASSWORD` to the password you created in step 3.

## Building
Once variables are set, run:
```bash
npm run dist
```
This will build, sign, and notarize your app. The notarization process can take several minutes.

## Notarization: HTTP 401 “Invalid credentials”

Apple’s `notarytool` returns **401** when the **Apple ID + app-specific password + team ID** combination is rejected. Typical fixes:

1. **Regenerate** an app-specific password at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords, then update `APPLE_APP_SPECIFIC_PASSWORD` in `desktop/.env` (old passwords stop working if revoked or rotated).
2. **`APPLE_ID`** must be the **same Apple ID email** as your Apple Developer / App Store Connect account (not an alias that isn’t tied to the membership).
3. **`APPLE_TEAM_ID`** must be the **10-character Team ID** from [developer.apple.com](https://developer.apple.com/account) → Membership. It should match the team shown on your **Developer ID Application** certificate (your signing log shows the team in parentheses next to the identity name).
4. **CI / alternative:** use **App Store Connect API key** notarization instead (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` per `desktop/.env.example`) — avoids app-specific passwords and is more stable for automation.
