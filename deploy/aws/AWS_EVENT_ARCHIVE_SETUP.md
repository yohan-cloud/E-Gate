AWS Event Archive Setup

Goal
- Keep live and upcoming events in the operational system.
- Store ended, completed, or cancelled event records in AWS S3 for historical reporting and research.

Archival rule
- Events can be archived when they are:
  - `completed`
  - `cancelled`
  - past their `end_date`
  - past their `date` when no `end_date` exists

What the event archive includes
- core event details
- registrations
- attendance records
- gate entry logs captured for the event

Recommended bucket naming
- Example bucket: `egate-barangay663a-event-archive`
- Example archive prefix: `events`

Recommended first-pass settings
- Region: `ap-southeast-2`
- Storage class on upload: `STANDARD`
- Bucket versioning: `Enabled`
- Default bucket encryption: `SSE-S3 (AES256)`

Step 1. Create the S3 bucket
1. Open AWS S3.
2. Create a bucket.
3. Pick a globally unique bucket name.
4. Choose region `ap-southeast-2`.
5. Keep "Block all public access" enabled.
6. Enable Versioning.
7. Enable default encryption.
8. Create the bucket.

Step 2. Create the IAM policy
1. Open IAM.
2. Create a policy.
3. Paste `deploy/aws/event-archive-iam-policy.json`.
4. The defaults are:
   - bucket: `egate-barangay663a-event-archive`
   - prefix: `events`
5. If your bucket name differs, update the JSON first.
6. Save the policy as `egate-event-archive-policy`.

Step 3. Attach the policy
- You can attach this to the same local archive IAM user already used for guest and resident archival.
- If you prefer stricter separation, create a dedicated IAM user for event archive uploads.

Step 4. Configure the backend env
Use `deploy/aws/event-archive.env.example` and copy it into the machine that runs Django.

Minimum required values
```env
EVENT_ARCHIVE_STORAGE_BACKEND=s3
EVENT_ARCHIVE_KEY_PREFIX=events
EVENT_ARCHIVE_S3_BUCKET=egate-barangay663a-event-archive
EVENT_ARCHIVE_S3_REGION=ap-southeast-2
EVENT_ARCHIVE_S3_STORAGE_CLASS=STANDARD
EVENT_ARCHIVE_S3_SSE=AES256
```

Step 5. Test one event archive
1. Start the backend with the updated env.
2. Open the admin events module.
3. Archive one ended event.
4. Confirm an object appears in:
   - `events/<year>/...`

What to point out in the JSON
- event title, schedule, venue, and status
- event registrations snapshot
- attendance snapshot
- event gate entry log history

Operational notes
- Archive only events that are no longer operationally active.
- Keep the bucket private and versioned.
- If the recommended bucket name is already taken, choose a close variant and update both the IAM policy and `.env`.
