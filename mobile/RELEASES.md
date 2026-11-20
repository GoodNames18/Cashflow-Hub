# Android updates and rollback builds

Keep the application ID and permanent signing certificate unchanged. Every delivered APK must have a versionCode higher than the installed APK. The Android workflow assigns `1000 + github.run_number`, so always start a NEW workflow run for a rollback; do not re-run an older run or redistribute its old APK.

To restore older behavior, run **Build Android APK** from the latest `Haeo!` workflow. Set `source_ref` to the known good commit/tag and `release_version` to the next release name. The workflow checks out that old code, overrides only its displayed version, and signs it with the permanent certificate. Verify the resulting APK versionCode exceeds the latest delivered build before distributing it.

Users install the newly rebuilt rollback APK over the current app without uninstalling or clearing data. Android cannot be made to accept an arbitrary original older APK through an app setting; the old code needs a new build number.

Keep the same target release name throughout intermediate builds until its APK is delivered. Website rollbacks also require a fresh service-worker cache name. Keep newer work in Git history for later fixes.

Release 2.8.9 restores the 2.8.7 application code from `5c30a3ffd4bde2f3afb326c0ba154a09fcaea3f4`. Only release metadata, offline cache identity, and rollback-build support differ.
