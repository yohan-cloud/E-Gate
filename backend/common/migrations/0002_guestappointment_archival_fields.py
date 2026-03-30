from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="guestappointment",
            name="archive_checksum",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archive_error",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archive_key",
            field=models.CharField(blank=True, max_length=512),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archive_status",
            field=models.CharField(default="active", max_length=20),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archive_storage",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archived_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_appointments_archived", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="archived_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["archived_at"], name="common_gues_archived_4d54cf_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["archive_status"], name="common_gues_archive_a14280_idx"),
        ),
    ]
