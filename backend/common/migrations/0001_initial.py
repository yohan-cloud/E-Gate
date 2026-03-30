from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="GuestAppointment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("contact", models.CharField(blank=True, max_length=64)),
                ("purpose", models.CharField(max_length=160)),
                ("eta", models.DateTimeField()),
                ("status", models.CharField(choices=[("expected", "Expected"), ("arrived", "Arrived"), ("completed", "Completed"), ("cancelled", "Cancelled")], default="expected", max_length=20)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_appointments_created", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="guest_appointments_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["eta", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="AdminSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=64)),
                ("value", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="admin_settings", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["eta"], name="common_gues_eta_bce93a_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["status"], name="common_gues_status_17ae15_idx"),
        ),
        migrations.AddIndex(
            model_name="guestappointment",
            index=models.Index(fields=["created_at"], name="common_gues_created_c18359_idx"),
        ),
        migrations.AddIndex(
            model_name="adminsetting",
            index=models.Index(fields=["key"], name="common_admi_key_9cb456_idx"),
        ),
        migrations.AddIndex(
            model_name="adminsetting",
            index=models.Index(fields=["updated_at"], name="common_admi_updated_c3a95d_idx"),
        ),
        migrations.AlterUniqueTogether(
            name="adminsetting",
            unique_together={("user", "key")},
        ),
    ]
