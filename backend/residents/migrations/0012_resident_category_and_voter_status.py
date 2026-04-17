from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0011_remove_residentprofile_residents_r_archived_d02e8a_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="resident_category",
            field=models.CharField(
                choices=[
                    ("employee", "Employee"),
                    ("resident", "Resident"),
                    ("client", "Client"),
                ],
                default="resident",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="voter_status",
            field=models.CharField(
                choices=[
                    ("registered_voter", "Registered Voter"),
                    ("not_yet_voter", "Not Yet Voter"),
                    ("unspecified", "Unspecified"),
                ],
                default="unspecified",
                max_length=20,
            ),
        ),
    ]
