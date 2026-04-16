from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("residents", "0007_user_is_gate_operator"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="archive_checksum",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archive_error",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archive_key",
            field=models.CharField(blank=True, max_length=512),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archive_status",
            field=models.CharField(default="active", max_length=20),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archive_storage",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archived_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="resident_profiles_archived", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="archived_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="residentprofile",
            index=models.Index(fields=["archived_at"], name="residents_r_archived_d02e8a_idx"),
        ),
        migrations.AddIndex(
            model_name="residentprofile",
            index=models.Index(fields=["archive_status"], name="residents_r_archive_f04010_idx"),
        ),
    ]
