from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0009_user_must_change_password"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="deactivated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="deactivated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="resident_profiles_deactivated",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="deactivation_reason",
            field=models.TextField(blank=True),
        ),
    ]
