# Android and website

The Android app bundles the existing website design using Capacitor 8. It signs in with the existing Cashflow Hub owner account. Financial records keep using the existing Supabase APIs; calendars now use private `cfh_calendar_state` rows and a revision-checked RPC.

Open the updated website on the phone holding the original schedules first. Wait for **Calendar synced across devices**, then sign into the APK with the same account. A one-time local backup is kept under `cfh-calendar-before-cloud-v1` before migration. The fresh APK downloads the synced calendar. Other devices with existing local data keep a backup before taking the cloud version. Device notification permissions and credentials are never copied between devices.

Calendar edits persist locally and retry when connected. Active clients poll every five seconds. Remote calendar updates wait until an open editor closes; conflicting edits require choosing a version. Financial save requests retain their existing behavior: this change does not add an offline financial transaction queue. Cloud changes sync to the APK while it is open; scheduled native reminders continue after it is closed, but changes made elsewhere while closed require opening the APK to refresh its native alarms.

Enable native notifications and grant Android notification and exact-alarm permissions. The official local-notifications plugin stores alarms and restores them after reboot. Simultaneous reminders are grouped to respect Android idle alarm restrictions. Up to the next 400 alarm times within 400 days are scheduled, refreshed on app launch, calendar change and foreground return. Force-stop, revoked permissions and manufacturer restrictions can prevent delivery; verify on the target phone. A scheduled time is not a delivery confirmation.

Build with Node 24, Java 21 and Android SDK 36:

```sh
npm ci
npm test
npm run build:android-web
npx cap sync android
cd android
CFH_SIGNING_PROPERTIES=/absolute/path/to/private/signing.properties ./gradlew assembleRelease
```

The workflow uploads a **signed release APK** using the permanent certificate. Signing material is encrypted in Supabase Vault and released only to the verified GitHub Actions build on Haeo!. The APK never contains the private signing material. Future updates retain this key and application ID. CI automatically sets versionCode to 1000 plus the Android workflow run number; retain this workflow so its counter keeps increasing. Manual builds must set CFH_ANDROID_VERSION_CODE higher than the installed build. Do not regenerate the key or commit it. Legacy debug test APKs require one final reinstall because their ephemeral signing keys were not retained. The website URL stays https://goodnames18.github.io/Cashflow-Hub/.
