from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('residents', '0002_face_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='residentprofile',
            name='phone_number',
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
    ]
