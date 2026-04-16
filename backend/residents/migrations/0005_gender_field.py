from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0004_verification_request"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="gender",
            field=models.CharField(
                choices=[
                    ("male", "Male"),
                    ("female", "Female"),
                    ("other", "Other"),
                    ("unspecified", "Unspecified"),
                ],
                default="unspecified",
                max_length=20,
            ),
        ),
    ]
