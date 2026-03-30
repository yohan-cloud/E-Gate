import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate_guest_qr_tokens(apps, schema_editor):
    GuestAppointment = apps.get_model("common", "GuestAppointment")
    for guest in GuestAppointment.objects.filter(qr_token__isnull=True):
        guest.qr_token = uuid.uuid4()
        guest.save(update_fields=["qr_token"])


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0002_guestappointment_archival_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="guestappointment",
            name="checked_in_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="checked_in_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_appointments_checked_in", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="checked_out_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="checked_out_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_appointments_checked_out", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="qr_token",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_guest_qr_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="guestappointment",
            name="qr_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["qr_token"], name="common_gues_qr_toke_dfbca2_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["checked_in_at"], name="common_gues_checked_6ae95b_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["checked_out_at"], name="common_gues_checked_84d2ff_idx"),
        ),
        migrations.CreateModel(
            name="GuestAppointmentScanLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("direction", models.CharField(choices=[("time_in", "Time In"), ("time_out", "Time Out")], max_length=10)),
                ("method", models.CharField(choices=[("qr", "QR"), ("manual", "Manual")], default="qr", max_length=10)),
                ("reason", models.CharField(blank=True, max_length=120)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("appointment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="scan_logs", to="common.guestappointment")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_scan_logs_created", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="guestappointmentscanlog",
            index=models.Index(fields=["created_at"], name="common_gues_created_f921fd_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointmentscanlog",
            index=models.Index(fields=["direction"], name="common_gues_directi_4fc95f_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointmentscanlog",
            index=models.Index(fields=["method"], name="common_gues_method_148b8f_idx"),
        ),
    ]
