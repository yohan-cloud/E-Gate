from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0014_alter_residentprofile_resident_category_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="contact_number",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
