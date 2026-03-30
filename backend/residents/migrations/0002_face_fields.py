from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="face_image",
            field=models.ImageField(blank=True, null=True, upload_to="faces/"),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="face_embedding",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="face_updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
    ]

