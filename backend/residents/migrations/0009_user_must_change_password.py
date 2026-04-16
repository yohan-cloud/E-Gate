from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0008_residentprofile_archival_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]
