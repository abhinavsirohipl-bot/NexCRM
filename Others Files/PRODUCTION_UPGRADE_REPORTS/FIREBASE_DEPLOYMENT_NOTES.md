# Firebase Deployment Notes

1. Confirm Firebase Console has Realtime Database enabled for project `nexcrm-372c7`.
2. Confirm `firebase-config.js` has the exact Realtime Database URL for your project.
3. Deploy the cleaned folder to GitHub Pages or Firebase Hosting.
4. Login as Admin and open Portal Settings.
5. Use **Upload Local Data to Firestore** button once from the browser that has your correct existing production data. The button name is preserved for compatibility, but it now uploads to Realtime Database.
6. Open Leads, MIS, Dashboard, Reports and HRMS pages and verify records are visible.
7. Keep `PRODUCTION_UPGRADE_REPORTS` in the package for audit history; it can be removed later if you do not want public deployment reports.

Suggested Realtime Database rules after validation:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Tighten these rules with role-based paths once admin/employee Firebase Auth users are fully created.
