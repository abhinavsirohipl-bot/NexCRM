# localStorage to Firebase Realtime Database Migration Report

Generated: 2026-06-17 11:50:34

## What changed
- Added `firebase-config.js` as the single Firebase config source.
- Added `nexcrm-realtime-database.js` as the production sync layer.
- Replaced old Firestore sync file references with the Realtime Database sync layer.
- Preserved old function names (`migrateLocalStorageToFirestore`, `pullFirestoreToLocal`) as backwards-compatible aliases, so existing buttons still work.
- CRM data paths:
  - `nexcrmLeads` / `nexcrm_sheet_leads` -> `/leads/localStorage`
  - `nexcrm_mis_cases` -> `/mis/localStorage`
  - `nexcrmDetailsheets` / `nexcrm_detailsheets` -> `/detailsheets/localStorage`
  - `nexcrmObligations` -> `/obligations/localStorage`
  - dashboard stats -> `/dashboardStats/localStorage`
  - activity logs -> `/activityLogs/localStorage`
- HRMS data paths:
  - employees -> `/hrms/employees/localStorage`
  - joining forms -> `/hrms/joiningForms/localStorage`
  - offer letters -> `/hrms/offerLetters/localStorage`
  - payslips -> `/hrms/payslips/localStorage`
  - attendance -> `/hrms/attendance/localStorage`
  - costing -> `/hrms/employeeCosting/localStorage`
  - DDR/MDR -> `/hrms/ddrMdr/localStorage`
  - vault -> `/hrms/vault/localStorage`

## Important deployment note
The `databaseURL` is set to `https://nexcrm-372c7-default-rtdb.firebaseio.com`. If your Firebase Realtime Database was created in another region, replace this URL inside `firebase-config.js` with the exact Database URL shown in Firebase Console.
