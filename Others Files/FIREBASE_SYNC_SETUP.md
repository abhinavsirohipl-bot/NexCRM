# NexCRM Firebase Sync Setup

Firebase Auth is now the main session system. Create Firebase Authentication users for admins and employees, then publish the Firestore rules in `firestore.rules`.

## Users

- Admin email: `abhinav.sirohi@nexfund.in`
- Employee IDs are converted to Firebase Auth emails as `<employee-id>@nexfund.in`. Example: `E-TC001` logs in as `e-tc001@nexfund.in` behind the scenes.
- Create those users in Firebase Authentication with their assigned passwords.

## Roles

The admin email is treated as admin automatically. For extra admins or employees with explicit roles, create Firestore docs:

Collection: `nexcrmRoles`
Document ID: Firebase Auth `uid`

Admin doc:
```json
{ "role": "admin", "admin": true }
```

Employee doc:
```json
{ "role": "employee" }
```

## Data paths

- Shared business data: `nexcrmShared/localStorage/keys/{encodedKey}`
- Per-user form/recent search data: `nexcrmUsers/{uid}/localStorage/{encodedKey}`

Keep localStorage as fallback/offline backup. After login, Firestore hydrates localStorage and becomes the source of truth.

## Migration

Login as admin, open Portal Settings, and click `Upload Local Data to Firestore`. This copies existing NexCRM localStorage data into Firestore.

Firebase references used: Firebase Web compat SDK loading and Firestore initialization from the Firestore quickstart, and authenticated role checks from Firebase Security Rules/Auth guidance.