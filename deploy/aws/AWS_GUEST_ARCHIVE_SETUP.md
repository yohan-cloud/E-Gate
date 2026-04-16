AWS Guest Archive Setup

Goal
- Keep the live system local inside Barangay 663-A.
- Store archived guest data off-site in AWS S3 for research and long-term retention.

Recommended bucket naming
- Example bucket: `egate-barangay663a-guest-archive`
- Example archive prefix: `guest_appointments`

Recommended first-pass settings
- Region: `ap-southeast-2`
- Storage class on upload: `STANDARD`
- Bucket versioning: `Enabled`
- Default bucket encryption: `SSE-S3 (AES256)` for simplicity
- Lifecycle: move old archive objects to Glacier later

Step 1. Create the S3 bucket
1. Open AWS S3.
2. Create a bucket.
3. Pick a globally unique bucket name.
4. Choose your AWS region.
5. Keep "Block all public access" enabled.
6. Enable Versioning.
7. Enable default encryption.
8. Create the bucket.

Step 2. Create the IAM policy
1. Open IAM.
2. Create a policy.
3. Paste the contents of `deploy/aws/guest-archive-iam-policy.json`.
4. The template already uses the recommended defaults:
   - bucket: `egate-barangay663a-guest-archive`
   - prefix: `guest_appointments`
5. If your chosen bucket name is different, update the JSON before saving.
6. Save the policy with a name like `egate-guest-archive-policy`.

Step 3. Attach the policy
- If your Django backend runs on EC2:
  - Create an IAM role and attach the policy.
  - Attach the role to the EC2 instance.
- If your Django backend runs locally in the barangay office:
  - Create an IAM user with programmatic access.
  - Attach the policy to that IAM user.
  - Configure credentials on the server with `aws configure` or environment variables.

Step 4. Configure the backend env
Use `deploy/aws/guest-archive.env.example` and copy the values into the machine that runs Django.

Minimum required values
```env
ARCHIVE_STORAGE_BACKEND=s3
ARCHIVE_KEY_PREFIX=guest_appointments
ARCHIVE_S3_BUCKET=egate-barangay663a-guest-archive
ARCHIVE_S3_REGION=ap-southeast-2
ARCHIVE_S3_STORAGE_CLASS=STANDARD
ARCHIVE_S3_SSE=AES256
```

If you use KMS instead of AES256
```env
ARCHIVE_S3_SSE=aws:kms
ARCHIVE_S3_KMS_KEY_ID=your-kms-key-id-or-arn
```

Step 5. Test one archive
1. Start the backend with the updated env.
2. Archive one guest from the admin guest module.
3. Confirm in S3 that a JSON file appears under:
   - `guest_appointments/<year>/...`

Step 6. Test bulk archival
Dry run first:
```bash
python backend/manage.py archive_guest_appointments --days-old 7 --dry-run
```

Then real run:
```bash
python backend/manage.py archive_guest_appointments --days-old 7 --limit 100
```

Step 7. Schedule the archive job
- Windows local server:
  - Use Task Scheduler.
  - Run once per day, for example `11:30 PM`.
- Linux server:
  - Use cron or a systemd timer.

Suggested archive policy
- Archive completed guest appointments after `7` days.
- Keep active and recently completed records in the live system for quick lookup.
- Store research snapshots in S3 long term.

Suggested S3 lifecycle policy
- Keep new objects in `STANDARD` first.
- Transition to `Glacier Flexible Retrieval` after `90` days.
- Transition to `Deep Archive` later only if retrieval speed is not important.

Operational notes
- Keep the archive bucket private.
- Do not store AWS credentials in git.
- Prefer IAM role access over long-lived IAM user keys when possible.
- After configuring AWS, rotate the Gmail app password currently present in the local `.env`.
- The recommended bucket name may already be taken globally in AWS S3. If that happens, pick a close variant and update both the IAM policy and `.env`.
