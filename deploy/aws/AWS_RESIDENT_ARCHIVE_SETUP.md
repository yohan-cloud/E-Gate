AWS Resident Archive Setup

Goal
- Keep resident operations and face-based gate entry local.
- Archive resident administrative records to AWS S3 without storing biometric face data in the cloud.

Privacy design
- The resident archive payload intentionally excludes:
  - `face_image`
  - `face_embedding`
- The archive only records whether a face enrollment existed at archive time.

Recommended bucket naming
- Example bucket: `egate-barangay663a-resident-archive`
- Example archive prefix: `resident_profiles`

Recommended first-pass settings
- Region: `ap-southeast-2`
- Storage class on upload: `STANDARD`
- Bucket versioning: `Enabled`
- Default bucket encryption: `SSE-S3 (AES256)` for simplicity

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
3. Paste `deploy/aws/resident-archive-iam-policy.json`.
4. The defaults are:
   - bucket: `egate-barangay663a-resident-archive`
   - prefix: `resident_profiles`
5. If your bucket name differs, update the JSON first.
6. Save the policy as `egate-resident-archive-policy`.

Step 3. Attach the policy
- If you want to reuse the same IAM user as guest archival:
  - attach this resident archive policy to the same user
- If you prefer stricter separation:
  - create a second IAM user just for resident archive uploads

Step 4. Configure the backend env
Use `deploy/aws/resident-archive.env.example` and copy it into the machine that runs Django.

Minimum required values
```env
RESIDENT_ARCHIVE_STORAGE_BACKEND=s3
RESIDENT_ARCHIVE_KEY_PREFIX=resident_profiles
RESIDENT_ARCHIVE_S3_BUCKET=egate-barangay663a-resident-archive
RESIDENT_ARCHIVE_S3_REGION=ap-southeast-2
RESIDENT_ARCHIVE_S3_STORAGE_CLASS=STANDARD
RESIDENT_ARCHIVE_S3_SSE=AES256
```

Step 5. Test one resident archive
1. Start the backend with the updated env.
2. Open the admin residents module.
3. Archive one resident.
4. Confirm an object appears in:
   - `resident_profiles/<year>/...`

What to point out in the JSON
- resident identity and profile fields are included
- biometric face data is not present
- `biometric_data_archived` is `false`
- `has_face_enrollment` can still show whether the resident had local face enrollment

Operational notes
- This separate bucket supports stronger privacy separation between guest research data and resident records.
- Keep resident face-recognition operational data in the local live system only.
- If the recommended bucket name is already taken, choose a close variant and update both the IAM policy and `.env`.
